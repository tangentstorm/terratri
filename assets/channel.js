/**
 * channel.js — Socket.IO replacement for the old GAE Channel API.
 * Preserves the same ChannelAPI.init / ChannelAPI.sendMessage interface
 * so terratri.js doesn't need changes.
 */
var ChannelAPI = (function(){

   var pub = {};
   var mSocket = null;
   var mGameKey = "";
   var mCallback = function (data) { };

   pub.init = function(gameKey, callback)
   {
      mGameKey = gameKey;
      mCallback = callback;

      mSocket = io();
      mSocket.on('connect', function() {
         mSocket.emit('join', { gameKey: mGameKey });
      });
      mSocket.on('update', function(data) {
         mCallback(data);
      });
      mSocket.on('connect_error', function(err) {
         console.error("socket connection error:", err);
      });
   };

   pub.sendMessage = function(path, optParam)
   {
      if (path === '/move') {
         var step = optParam.replace('step=', '');
         mSocket.emit('move', { gameKey: mGameKey, step: step });
      }
   };

   return pub;

}());
