/* globals NSPipe, NSTask, NSArray, NSString, coscript, NSFileHandleDataAvailableNotification,
  NSNotificationCenter, NSSelectorFromString, NSDictionary, NSTaskDidTerminateNotification */
var ObjCClass = require('cocoascript-class').default
var EventEmitter = require('events')
var spawnSync = require('./spawnSync')
var handleData = require('./handleData')
var normalizeSpawnArguments = require('./normalizeSpawnArguments')
// We create one ObjC class for ourselves here
var ChildProcess

function onCleanup(child) {
  return function cleanup() {
    NSNotificationCenter.defaultCenter().removeObserver(child)
  }
}

function spawn(_command, _args, _options) {
  var opts = normalizeSpawnArguments(_command, _args, _options)

  var result = new EventEmitter()

  if (opts.file[0] !== '.' && opts.file[0] !== '/' && opts.file[0] !== '~') {
    // means that someone refered to an executable that might be in the path, let's find it
    var whichChild = spawnSync('/bin/bash', ['-l', '-c', 'which ' + opts.file], { encoding: 'utf8' })
    var resolvedCommand = String(whichChild.stdout || '').trim()
    if (whichChild.err || !resolvedCommand.length) {
      result.stderr = new EventEmitter()
      result.stdout = new EventEmitter()

      result.pid = '-1'

      result.stderr.setEncoding = function setEncoding(encoding) {
        result.stderr.encoding = encoding
      }
      result.stdout.setEncoding = function setEncoding(encoding) {
        result.stdout.encoding = encoding
      }
      if (!resolvedCommand.length) {
        result.emit('error', new Error(String(opts.file) + ' ENOENT'))
      } else {
        result.emit('error', whichChild.err)
      }
      return result
    }
    return spawn(resolvedCommand, _args, _options)
  }

  var options = opts.options

  result.stderr = new EventEmitter()
  result.stdout = new EventEmitter()

  result.stderr.encoding = options.encoding || 'utf8'
  result.stdout.encoding = options.encoding || 'utf8'

  result.stderr.setEncoding = function setEncoding(encoding) {
    result.stderr.encoding = encoding
  }
  result.stdout.setEncoding = function setEncoding(encoding) {
    result.stdout.encoding = encoding
  }

  if (!ChildProcess) {
    ChildProcess = ObjCClass({
      classname: 'ChildProcess',
      listeners: null,
      fileHandle: null,
      errFileHandle: null,
      task: null,

      spawn: function spawnMethod(args, listeners) {
        this.listeners = NSDictionary.dictionaryWithDictionary(listeners)
        var pipe = NSPipe.pipe()
        var errPipe = NSPipe.pipe()

        this.fileHandle = pipe.fileHandleForReading()
        this.fileHandle.waitForDataInBackgroundAndNotify()

        this.errFileHandle = errPipe.fileHandleForReading()
        this.errFileHandle.waitForDataInBackgroundAndNotify()

        this.task = NSTask.alloc().init()
        this.task.setLaunchPath(NSString.stringWithString(opts.file).stringByExpandingTildeInPath())
        this.task.arguments = NSArray.arrayWithArray(args.args || [])
        if (args.envPairs) {
          this.task.environment = args.envPairs
        }
        if (args.cwd) {
          this.task.setCurrentDirectoryPath(
            NSString.stringWithString(args.cwd).stringByExpandingTildeInPath()
          )
        }

        this.task.setStandardOutput(pipe)
        this.task.setStandardError(errPipe)

        this.task.launch()
      },

      kill: function kill() {
        if (this.task) {
          this.task.terminate()
        }
      },

      'readLine:': function readLine(fileHandle) {
        var fileDescriptor = fileHandle.object().fileDescriptor()
        if (fileDescriptor != this.fileHandle.fileDescriptor()
          && fileDescriptor != this.errFileHandle.fileDescriptor()) {
          return
        }
        var data = fileHandle.object().availableData()
        if (!data) {
          return
        }

        if (fileDescriptor == this.fileHandle.fileDescriptor()) {
          this.listeners.onStdout(data)
          if (this.task) {
            this.fileHandle.waitForDataInBackgroundAndNotify()
          }
        } else if (fileDescriptor == this.errFileHandle.fileDescriptor()) {
          this.listeners.onStderr(data)
          if (this.task) {
            this.errFileHandle.waitForDataInBackgroundAndNotify()
          }
        }
      },

      'taskTerminated:': function taskTerminated(task) {
        if (task.object().processIdentifier() == this.task.processIdentifier()) {
          this.listeners.onEnd(Number(this.task.terminationStatus()), null)
        }
      }
    })
  }

  var child

  try {
    child = ChildProcess.new()
  } catch (err) {
    result.emit('error', err)
    return result
  }

  result.killed = false
  var fiber
  if (coscript.createFiber) {
    fiber = coscript.createFiber()
    fiber.onCleanup(onCleanup(child))
  } else {
    coscript.shouldKeepAround = true
  }

  function cleanupAsync() {
    if (fiber) {
      fiber.cleanup()
    } else {
      NSNotificationCenter.defaultCenter().removeObserver(child)
      coscript.shouldKeepAround = false
    }
  }

  function onStdout(data) {
    if (data && data.length()) {
      result.stdout.emit('data', handleData(data, result.stdout.encoding))
    }
  }
  function onStderr(data) {
    if (data && data.length()) {
      result.stderr.emit('data', handleData(data, result.stderr.encoding))
    }
  }

  child.spawn({
    file: opts.file,
    args: opts.args,
    cwd: options.cwd,
    detached: !!options.detached,
    envPairs: opts.envPairs,
    stdio: options.stdio,
    uid: options.uid,
    gid: options.gid
  }, {
    onStdout: onStdout,
    onStderr: onStderr,
    onEnd: function onEnd(code, signal) {
      if (!result.killed) {
        // flush remaining data
        onStdout(child.fileHandle.readDataToEndOfFile())
        onStderr(child.errFileHandle.readDataToEndOfFile())

        result.emit('close', code, signal)
        result.stderr.emit('close')
        result.stdout.emit('close')

        cleanupAsync()
      }
    }
  })

  NSNotificationCenter.defaultCenter().addObserver_selector_name_object(
    child,
    NSSelectorFromString('readLine:'),
    NSFileHandleDataAvailableNotification,
    null
  )

  NSNotificationCenter.defaultCenter().addObserver_selector_name_object(
    child,
    NSSelectorFromString('taskTerminated:'),
    NSTaskDidTerminateNotification,
    null
  )

  result.kill = function kill(signal) {
    if (!result.killed) {
      result.killed = true
      result.emit('close', null, signal)
      child.kill()
      cleanupAsync()
    }
  }

  result.pid = String(child.task.processIdentifier())

  return result
}

module.exports = spawn
