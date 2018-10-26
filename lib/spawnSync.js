/* globals NSPipe, NSTask, NSArray, NSString */
var handleData = require('./handleData')
var normalizeSpawnArguments = require('./normalizeSpawnArguments')

function spawnSync(_command, _args, _options) {
  var opts = normalizeSpawnArguments(_command, _args, _options)

  if (opts.file[0] !== '.' && opts.file[0] !== '/' && opts.file[0] !== '~') {
    // means that someone refered to an executable that might be in the path, let's find it
    var whichChild = spawnSync(
      '/bin/bash',
      ['-l', '-c', 'which ' + opts.file],
      { encoding: 'utf8' }
    )
    if (whichChild.err) {
      return whichChild
    }
    var resolvedCommand = String(whichChild.stdout).trim()
    if (!resolvedCommand.length) {
      return {
        err: new Error(String(opts.file) + ' ENOENT')
      }
    }
    return spawnSync(resolvedCommand, _args, _options)
  }

  var options = opts.options

  var pipe = NSPipe.pipe()
  var errPipe = NSPipe.pipe()

  try {
    var task = NSTask.alloc().init()
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

    task.setStandardOutput(pipe)
    task.setStandardError(errPipe)

    task.launch()
    task.waitUntilExit()

    return {
      pid: String(task.processIdentifier()),
      status: Number(task.terminationStatus()),
      get stdout() {
        var data = pipe.fileHandleForReading().readDataToEndOfFile()
        return handleData(data, options.encoding || 'buffer')
      },
      get stderr() {
        var data = errPipe.fileHandleForReading().readDataToEndOfFile()
        return handleData(data, options.encoding || 'buffer')
      }
    }
  } catch (err) {
    return {
      err: err
    }
  }
}

module.exports = spawnSync
