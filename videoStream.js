var MP4Muxer, STREAM_MAGIC_BYTES, VideoStream, events, util, ws

ws = require('ws')

util = require('util')

events = require('events')

/** Command:
 * ffmpeg -rtsp_transport tcp -i rtsp://192.168.15.41 -f h264 -codec:v h264 -
 */
MP4Muxer = require('./mp4muxer')

STREAM_MAGIC_BYTES = "jsmp" // Must be 4 bytes

VideoStream = function(options) {
  this.options = options
  this.name = options.name
  this.streamUrl = options.streamUrl
  this.width = options.width
  this.height = options.height
  this.wsPort = options.wsPort
  this.inputStreamStarted = false
  this.stream = undefined
  this.startMP4Stream()
  this.pipeStreamToSocketServer()
  return this
}

util.inherits(VideoStream, events.EventEmitter)

VideoStream.prototype.stop = function() {
  this.wsServer.close()
  this.stream.kill()
  this.inputStreamStarted = false
  return this
}

VideoStream.prototype.startMP4Stream = function() {
  var gettingInputData, gettingOutputData, inputData, outputData
  this.MP4Muxer = new MP4Muxer({
    ffmpegOptions: this.options.ffmpegOptions,
    url: this.streamUrl,
    ffmpegPath: this.options.ffmpegPath == undefined ? "ffmpeg" : this.options.ffmpegPath
  })
  this.stream = this.MP4Muxer.stream
  if (this.inputStreamStarted) {
    return
  }
  this.MP4Muxer.on('mp4data', (data) => {
    return this.emit('camdata', data)
  })
  gettingInputData = false
  inputData = []
  gettingOutputData = false
  outputData = []
  this.MP4Muxer.on('ffmpegStderr', (data) => {
    var size
    data = data.toString()
    if (data.indexOf('Input #') !== -1) {
      gettingInputData = true
    }
    if (data.indexOf('Output #') !== -1) {
      gettingInputData = false
      gettingOutputData = true
    }
    if (data.indexOf('frame') === 0) {
      gettingOutputData = false
    }
    if (gettingInputData) {
      inputData.push(data.toString())
      size = data.match(/\d+x\d+/)
      if (size != null) {
        size = size[0].split('x')
        if (this.width == null) {
          this.width = parseInt(size[0], 10)
        }
        if (this.height == null) {
          return this.height = parseInt(size[1], 10)
        }
      }
    }
  })
  this.MP4Muxer.on('ffmpegStderr', function(data) {
    return global.process.stderr.write(data)
  })
  this.MP4Muxer.on('exitWithError', () => {
    return this.emit('exitWithError')
  })
  return this
}

VideoStream.prototype.pipeStreamToSocketServer = function() {
  this.wsServer = new ws.Server({
    port: this.wsPort
  })
  this.wsServer.on("connection", (socket, request) => {
    return this.onSocketConnect(socket, request)
  })
  this.wsServer.broadcast = function(data, opts) {
    var results
    results = []
    for (let client of this.clients) {
      if (client.readyState === 1) {
        results.push(client.send(data, opts))
      } else {
        results.push(console.log("Error: Client from remoteAddress " + client.remoteAddress + " not connected."))
      }
    }
    return results
  }
  return this.on('camdata', (data) => {
    return this.wsServer.broadcast(data)
  })
}

VideoStream.prototype.onSocketConnect = function(socket, request) {
  var streamHeader
  // Send magic bytes and video size to the newly connected socket
  // struct { char magic[4]; unsigned short width, height;}
  streamHeader = new Buffer.alloc(8);
  streamHeader.write(STREAM_MAGIC_BYTES);
  streamHeader.writeUInt16BE(this.width, 4);
  streamHeader.writeUInt16BE(this.height, 6);
  socket.send(streamHeader, {
    binary: true
  })
  console.log(`${this.name}: New WebSocket Connection (` + this.wsServer.clients.size + " total)")

  socket.remoteAddress = request.connection.remoteAddress

  return socket.on("close", (code, message) => {
    return console.log(`${this.name}: Disconnected WebSocket (` + this.wsServer.clients.size + " total)")
  })
}

module.exports = VideoStream