/* globals test, expect, NSString */
const exec = require('../exec')

test('should exec', () =>
  new Promise((resolve, reject) => {
    exec('cd ~/Desktop && pwd', (error, stdout, stderr) => {
      if (error) {
        reject(error)
        return
      }
      resolve({ stdout: stdout, stderr: stderr })
    })
  }).then(({ stdout, stderr }) => {
    expect(stderr.trim()).toBe('')
    expect(stdout.trim()).toBe(
      String(
        NSString.stringWithString('~/Desktop').stringByExpandingTildeInPath()
      )
    )
  }))

test('should run ps', () =>
  new Promise((resolve, reject) => {
    exec('/bin/ps', (error, stdout, stderr) => {
      if (error) {
        reject(error)
        return
      }
      resolve({ stdout: stdout, stderr: stderr })
    })
  }).then(({ stdout, stderr }) => {
    expect(stderr.trim()).toBe('')
    expect(typeof stdout.trim()).toBe('string')
    expect(stdout.trim().length > 0).toBe(true)
  }))
