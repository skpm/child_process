/* globals test, expect, NSString */
const execFile = require('../execFile')

test('should execFile', () => new Promise((resolve, reject) => {
  execFile('ls', ['-la'], { cwd: '~/Downloads' }, (error, stdout, stderr) => {
    if (error) {
      reject(error)
      return
    }
    resolve({ stdout: stdout, stderr: stderr })
  })
}).then(({ stdout, stderr }) => {
  expect(String(stderr.class())).toBe('')
  expect(stdout).toBe(String(NSString.stringWithString('~/Desktop').stringByExpandingTildeInPath()))
}))
