/* globals test, expect, NSString */
const execSync = require('../execSync')

test('should execSync', () => {
  const result = execSync('cd ~/Desktop && pwd', { encoding: 'utf8' })

  expect(result.trim()).toBe(String(NSString.stringWithString('~/Desktop').stringByExpandingTildeInPath()))
})
