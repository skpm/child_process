/* globals NSMutableData, NSData */
var spawn = require('./spawn')
var handleData = require('./handleData')

function validateTimeout(timeout) {
  if (timeout != null && !(Number.isInteger(timeout) && timeout >= 0)) {
    throw new Error('ERR_OUT_OF_RANGE options.timeout')
  }
}


function validateMaxBuffer(maxBuffer) {
  if (maxBuffer != null && !(typeof maxBuffer === 'number' && maxBuffer >= 0)) {
    throw new Error('ERR_OUT_OF_RANGE options.maxBuffer')
  }
}

function concatData(prev, data) { prev.appendData(data); return prev }

module.exports = function execFile(file, args, options, callback) {
  var defaultOptions = {
    encoding: 'utf8',
    timeout: 0,
    maxBuffer: 200 * 1024,
    killSignal: 'SIGTERM',
    cwd: undefined,
    env: undefined,
    shell: false
  }

  if (typeof args === 'function') {
    // function (file, callback)
    callback = args
    args = []
    options = defaultOptions
  } else if (typeof args === 'object' && !Array.isArray(args)) {
    // function (file, options, callback)
    callback = options
    options = Object.assign(defaultOptions, args)
    args = []
  } else {
    // function (file, args, options, callback)
    options = Object.assign(defaultOptions, options)
  }

  // Validate the timeout, if present.
  validateTimeout(options.timeout)

  // Validate maxBuffer, if present.
  validateMaxBuffer(options.maxBuffer)

  var child = spawn(file, args, {
    cwd: options.cwd,
    env: options.env,
    gid: options.gid,
    uid: options.uid,
    shell: options.shell
  })

  var encoding = options.encoding
  var _stdout = []
  var _stderr = []

  var stdoutLen = 0
  var stderrLen = 0
  var killed = false
  var exited = false
  var timeoutId

  var ex = null

  var cmd = file

  function exithandler(code, signal) {
    if (exited) return
    exited = true

    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }

    if (!callback) return

    // merge chunks
    var stdout = handleData(
      NSData.dataWithData(
        _stdout.reduce(concatData, NSMutableData.data())
      ),
      encoding
    )
    var stderr = handleData(
      NSData.dataWithData(
        _stderr.reduce(concatData, NSMutableData.data())
      ),
      encoding
    )

    if (!ex && code === 0 && signal === null) {
      callback(null, stdout, stderr)
      return
    }

    if (args.length !== 0) {
      cmd += ' ' + args.join(' ')
    }

    if (!ex) {
      ex = new Error('Command failed: ' + cmd + '\n' + stderr)
      ex.killed = child.killed || killed
      ex.code = code
      ex.signal = signal
    }

    ex.cmd = cmd
    callback(ex, stdout, stderr)
  }

  function errorhandler(e) {
    ex = e

    exithandler()
  }

  function kill() {
    killed = true
    try {
      child.kill(options.killSignal)
    } catch (e) {
      ex = e
      exithandler()
    }
  }

  if (options.timeout > 0) {
    timeoutId = setTimeout(function delayedKill() {
      kill()
      timeoutId = null
    }, options.timeout)
  }

  if (child.stdout) {
    child.stdout.setEncoding('NSData')
    child.stdout.on('data', function onChildStdout(chunk) {
      stdoutLen += chunk.length()

      if (stdoutLen > options.maxBuffer) {
        ex = new Error('ERR_CHILD_PROCESS_STDIO_MAXBUFFER stdout')
        kill()
      } else {
        _stdout.push(chunk)
      }
    })
  }

  if (child.stderr) {
    child.stderr.setEncoding('NSData')
    child.stderr.on('data', function onChildStderr(chunk) {
      stderrLen += chunk.length()

      if (stderrLen > options.maxBuffer) {
        ex = new Error('ERR_CHILD_PROCESS_STDIO_MAXBUFFER stderr')
        kill()
      } else {
        _stderr.push(chunk)
      }
    })
  }

  child.addListener('close', exithandler)
  child.addListener('error', errorhandler)

  return child
}
