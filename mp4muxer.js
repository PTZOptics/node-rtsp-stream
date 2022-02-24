var MP4Muxer, child_process, events, util

child_process = require('child_process')

util = require('util')

events = require('events')

MP4Muxer = function(options) {
  var key
  this.url = options.url
  this.ffmpegOptions = options.ffmpegOptions
  this.exitCode = undefined
  this.additionalFlags = []
  if (this.ffmpegOptions) {
    for (key in this.ffmpegOptions) {
      this.additionalFlags.push(key)
      if (String(this.ffmpegOptions[key]) !== '') {
        this.additionalFlags.push(String(this.ffmpegOptions[key]))
      }
    }
  }
  // Run ffmpeg and print output out to us
  this.spawnOptions = [
    "-rtsp_transport",
    "tcp",
    "-i",
    this.url,
    '-f',
    'h264',
    '-codec:v',
    'h264',
    // additional ffmpeg options go here
    ...this.additionalFlags,
    '-'
  ]
  this.stream = child_process.spawn(options.ffmpegPath, this.spawnOptions, {
    detached: false
  })
  this.inputStreamStarted = true
  this.stream.stdout.on('data', (data) => {
    return this.emit('mp4data', data)
  })
  this.stream.stderr.on('data', (data) => {
    return this.emit('ffmpegStderr', data)
  })
  this.stream.on('exit', (code, signal) => {
    if (code === 1) {
      console.error('RTSP stream exited with error')
      this.exitCode = 1
      return this.emit('exitWithError')
    }
  })
  return this
}

util.inherits(MP4Muxer, events.EventEmitter)

module.exports = MP4Muxer
