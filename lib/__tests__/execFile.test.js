/* globals test, expect */
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
  expect(stderr).toBe('')
  expect(typeof stdout.trim()).toBe('string')
  expect(stdout.trim().length > 0).toBe(true)
}))
