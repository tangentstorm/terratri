
var ChannelAPI = (function(){

   var pub = {};

   var mChannel = null;
   var mSocket = null;
   var mGameKey = "";
   var mConnected = false;
   var mCallback = function (data) { };

   pub.init = function(token, gameKey, callback)
   {
      mGameKey = gameKey;
      mCallback = callback;

      mChannel = new goog.appengine.Channel(token);
      mSocket = mChannel.open();
      mSocket.onopen = onOpened;
      mSocket.onmessage = onMessage;
      mSocket.onerror = onError;
      mSocket.onclose = onClose;
   };

   pub.sendMessage = function(path, optParam)
   {
      path += "?g=" + mGameKey;
      if (optParam) path += '&' + optParam;
      var xhr = new XMLHttpRequest();
      xhr.open('POST', path, true);
      xhr.send();
   };

   var onOpened = function()
   {
      mConnected = true;
      pub.sendMessage('/opened');
   };

   var onMessage = function(msg)
   {
      mCallback(JSON.parse(msg.data));
   };

   var onError = function()
   {
      alert("channel error. :/");
   };

   var onClose = function()
   {
   };

   return pub;

}());
