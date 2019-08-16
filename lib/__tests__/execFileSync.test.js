/* globals test, expect, NSString */
const execFileSync = require('../execFileSync')

test('should execFileSync', () => {
  const result = execFileSync('pwd', [], { cwd: '~/Desktop', encoding: 'utf8' })

  expect(result.trim()).toBe(
    String(
      NSString.stringWithString('~/Desktop').stringByExpandingTildeInPath()
    )
  )
})
