const CORE_MODULES = ['string_decoder', 'stream', 'buffer']
module.exports = (config) => {
  config.externals.push((context, request, callback) => {
    // core modules shipped in Sketch
    if (CORE_MODULES.indexOf(request) !== -1) {
      return callback(null, `commonjs ${request}`)
    }
    return callback()
  })
}
