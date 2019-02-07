/* globals NSPipe, NSTask, NSArray, NSString, coscript, __mocha__ */
var EventEmitter = require('events')
var spawnSync = require('./spawnSync')
var handleData = require('./handleData')
var normalizeSpawnArguments = require('./normalizeSpawnArguments')

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

  result.killed = false

  var fiber = coscript.createFiber()

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

  var task
  var signal = null

  try {
    task = NSTask.alloc().init()

    var pipe = NSPipe.pipe()
    var errPipe = NSPipe.pipe()

    task.setStandardOutput(pipe)
    task.setStandardError(errPipe)

    task.standardOutput().fileHandleForReading().setReadabilityHandler(
      __mocha__.createBlock_function('v16@?0@"NSFileHandle"8', function readStdOut(fileHandle) {
        try {
          onStdout(fileHandle.availableData())
        } catch (err) {
          console.error(err)
        }
      })
    )
    task.standardError().fileHandleForReading().setReadabilityHandler(
      __mocha__.createBlock_function('v16@?0@"NSFileHandle"8', function readStdOut(fileHandle) {
        try {
          onStderr(fileHandle.availableData())
        } catch (err) {
          console.error(err)
        }
      })
    )

    task.setLaunchPath(NSString.stringWithString(opts.file).stringByExpandingTildeInPath())
    task.arguments = NSArray.arrayWithArray(opts.args || [])
    if (opts.envPairs) {
      task.environment = opts.envPairs
    }
    if (options.cwd) {
      task.setCurrentDirectoryPath(
        NSString.stringWithString(options.cwd).stringByExpandingTildeInPath()
      )
    }

    task.setTerminationHandler(
      __mocha__.createBlock_function('v16@?0@"NSTask"8', function handleTermination(_task) {
        try {
          _task.standardError().fileHandleForReading().setReadabilityHandler(null)
          _task.standardOutput().fileHandleForReading().setReadabilityHandler(null)
          result.stderr.emit('close')
          result.stdout.emit('close')

          result.killed = true

          result.emit('close', Number(_task.terminationStatus()), signal)

          fiber.cleanup()
        } catch (err) {
          console.error(err)
          fiber.cleanup()
        }
      })
    )

    task.launch()
  } catch (err) {
    fiber.cleanup()
    result.emit('error', err)
    return result
  }

  result.kill = function kill(_signal) {
    if (!result.killed) {
      signal = _signal
      task.terminate()
    }
  }

  result.pid = String(task.processIdentifier())

  return result
}

module.exports = spawn
