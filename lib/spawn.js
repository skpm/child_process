/* globals log, NSPipe, NSTask, NSArray, NSHomeDirectory, NSFileHandleNotificationDataItem, NSUTF8StringEncoding, NSString, NSNotificationCenter, NSSelectorFromString, NSFileHandleReadCompletionNotification, NSDictionary, NSBundle */
var ObjCClass = require('cocoascript-class').default
var EventEmitter = require('@skpm/events')

function normalizeSpawnArguments(file, args, options) {
  if (typeof file !== 'string' || file.length === 0)
    throw new Error('ERR_INVALID_ARG_TYPE');

  if (Array.isArray(args)) {
    args = args.slice(0);
  } else if (args !== undefined && (args === null || typeof args !== 'object')) {
    throw new Error('ERR_INVALID_ARG_TYPE args');
  } else {
    options = args;
    args = [];
  }

  if (options === undefined)
    options = {};
  else if (options === null || typeof options !== 'object')
    throw new Error('ERR_INVALID_ARG_TYPE options');

  // Validate the cwd, if present.
  if (options.cwd != null && typeof options.cwd !== 'string') {
    throw new Error('ERR_INVALID_ARG_TYPE options.cwd');
  }

  // Validate detached, if present.
  if (options.detached != null && typeof options.detached !== 'boolean') {
    throw new Error('ERR_INVALID_ARG_TYPE options.detached');
  }

  // Validate the uid, if present.
  if (options.uid != null && !Number.isInteger(options.uid)) {
    throw new Error('ERR_INVALID_ARG_TYPE options.uid');
  }

  // Validate the gid, if present.
  if (options.gid != null && !Number.isInteger(options.gid)) {
    throw new Error('ERR_INVALID_ARG_TYPE options.gid');
  }

  // Validate the shell, if present.
  if (options.shell != null &&
      typeof options.shell !== 'boolean' &&
      typeof options.shell !== 'string') {
    throw new Error('ERR_INVALID_ARG_TYPE options.shell');
  }

  // Validate argv0, if present.
  if (options.argv0 != null && typeof options.argv0 !== 'string') {
    throw new Error('ERR_INVALID_ARG_TYPE options.argv0');
  }

  // Make a shallow copy so we don't clobber the user's options object.
  options = Object.assign({}, options);

  if (options.shell) {
    const command = [file].concat(args).join(' ');

    if (typeof options.shell === 'string') {
      file = options.shell;
    } else {
      file = '/bin/sh';
    }
    args = ['-c', command];
  }

  if (typeof options.argv0 === 'string') {
    args.unshift(options.argv0);
  } else {
    args.unshift(file);
  }

  var env = options.env || {};

  return {
    file: file,
    args: args,
    options: options,
    envPairs: env
  };
}

const ChildProcess = new ObjCClass({
  _listeners: null,
  _fileHandle: null,
  _errFileHandle: null
  _task: null,

  spawn(args, listeners) {
    this._listeners = NSDictionary.dictionaryWithDictionary(listeners)
    const pipe = NSPipe.pipe()
    const errPipe = NSPipe.pipe()

    this._fileHandle = pipe.fileHandleForReading()
    this._fileHandle.readInBackgroundAndNotify()

    this._errFileHandle = pipe.fileHandleForReading()
    this._errFileHandle.readInBackgroundAndNotify()

    this._task = NSTask.alloc().init()
    this._task.launchPath = args.file
    this._task.arguments = NSArray.arrayWithArray(args.args || [])
    this._task.environment = args.envPairs

    this._task.setStandardOutput(pipe)
    this._task.setStandardError(errPipe)

    this._task.launch()
  },

  kill() {
    if (this._task) {
      this._task.terminate()
    }
  },

  'readLine:': function readLine(fileHandle) {
    var fileDescriptor = fileHandle.fileDescriptor()
    if (fileDescriptor != this._fileHandle.fileDescriptor() &&
        fileDescriptor != this._errFileHandle.fileDescriptor()) {
      return
    }
    const data = fileHandle
      .userInfo()
      .objectForKey(NSFileHandleNotificationDataItem)
    if (!data) {
      return
    }
    const text = String(
      NSString.alloc().initWithData_encoding(data, NSUTF8StringEncoding)
    )

    if (fileDescriptor == this._fileHandle.fileDescriptor()) {
      this._listeners.onStdout(data)
      if (this._task) {
        this._fileHandle.readInBackgroundAndNotify()
      }
    } else if (fileDescriptor == this._errFileHandle.fileDescriptor()) {
      this._listeners.onStderr(data)
      if (this._task) {
        this._errFileHandle.readInBackgroundAndNotify()
      }
    }
  },

  'taskTerminated:': function taskTerminated(task) {
    if (task.processIdentifier() == this._task.processIdentifier()) {
      this._listeners.onEnd(this._task.terminationStatus(), null)
      this._task = null
    }
  }
})

function handleData(data, encoding) {
  switch (encoding) {
    case 'utf8':
      return NSString.alloc().initWithData_encoding(data, NSUTF8StringEncoding)
    case 'ascii':
      return NSString.alloc().initWithData_encoding(data, NSASCIIStringEncoding)
    case 'utf16le':
    case 'ucs2':
      return NSString.alloc().initWithData_encoding(data, NSUTF16LittleEndianStringEncoding)
    case 'base64':
      var nsdataDecoded = NSData.alloc().initWithBase64EncodedData_options(data, 0)
      return NSString.alloc().initWithData_encoding(nsdataDecoded, NSUTF8StringEncoding)
    case 'latin1':
    case 'binary':
      return NSString.alloc().initWithData_encoding(data, NSISOLatin1StringEncoding)
    case 'hex':
      // TODO: how?
      return data
    default:
      return data
  }
}

module.exports = function (command, args, options) {
  var opts = normalizeSpawnArguments.apply(null, arguments);
  var options = opts.options;
  var result = new EventEmitter()

  result.stderr = new EventEmitter()
  result.stdout = new EventEmitter()

  result.stderr.setEncoding = function (encoding) {
    result.stderr.encoding = encoding
  }
  result.stdout.setEncoding = function (encoding) {
    result.stdout.encoding = encoding
  }

  var child = new ChildProcess();
  result.killed = false
  var fiber
  if (typeof sketch === 'undefined' && sketch.createFiber) {
    fiber = sketch.createFiber()
  } else {
    coscript.shouldKeepAround = true
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
    onStdout: function (data) {
      result.stdout.emit('data', handleData(data, result.stdout.encoding))
    },
    onStderr: function (data) {
      result.stderr.emit('data', handleData(data, result.stderr.encoding))
    },
    onEnd: function (code, signal) {
      if (!result.killed) {
        result.emit('close', code, signal)
        result.stderr.emit('close')
        result.stdout.emit('close')
        if (fiber) {
          fiber.cleanup()
        } else {
          coscript.shouldKeepAround = false
        }
      }
    }
  })

  NSNotificationCenter.defaultCenter().addObserver_selector_name_object(
    task,
    NSSelectorFromString('readLine:'),
    NSFileHandleReadCompletionNotification,
    null
  )

  NSNotificationCenter.defaultCenter().addObserver_selector_name_object(
    listener,
    NSSelectorFromString('taskTerminated:'),
    NSTaskDidTerminateNotification,
    null
  )

  result.kill = function (signal) {
    if (!result.killed) {
      result.killed = true
      result.emit('close', null, signal)
      child.kill()
      if (fiber) {
        fiber.cleanup()
      } else {
        coscript.shouldKeepAround = false
      }
    }
  }

  result.pid = child._task.processIdentifier()

  return result
}
