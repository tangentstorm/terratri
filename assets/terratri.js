/**
 * terratri.js
 *
 * This is pretty much a dumb client for the terratri game.
 * The real logic happens on the server. This just sends
 * data back and forth and renders the current state.
 */
var terratri = (function($)
{
   var pub = {};

   const rsq = '<img class="sq" src="/assets/images/rsq.png"/>';
   const rpn = '<img class="pn" src="/assets/images/rpn.png"/>';
   const rft = '<img class="ft" src="/assets/images/rft.png"/>';
   const bsq = '<img class="sq" src="/assets/images/bsq.png"/>';
   const bpn = '<img class="pn" src="/assets/images/bpn.png"/>';
   const bft = '<img class="ft" src="/assets/images/bft.png"/>';
   const mvU = '<img class="step" src="/assets/images/U.png"/>';
   const mvD = '<img class="step" src="/assets/images/D.png"/>';
   const mvL = '<img class="step" src="/assets/images/L.png"/>';
   const mvR = '<img class="step" src="/assets/images/R.png"/>';
   const mvF = '<img class="step" src="/assets/images/F.png"/>';
   const mvX = '<img class="step" src="/assets/images/end.png"/>';
   const cols = 'abcde';
   const rows = '12345';

   var stepImg =
   {
      r:
      {
         n:mvU,
         s:mvD,
         e:mvR,
         w:mvL,
         f:mvF,
         x:mvX
      },

      b:
      {
         N:mvD,
         S:mvU,
         E:mvL,
         W:mvR,
         F:mvF,
         X:mvX
      }
   };



   pub.onUpdate = function(data)
   {
      var board = data['board'];
      var steps = data['validSteps'];
      var whoseTurn = data['whoseTurn'];
      var playingAs = data['playingAs'];
      var winner = data['winner'];
      var cell;

      // clear any old click handlers
      $('.cell').unbind('click');
      $('.step').unbind('click');
      $('.cell').empty();

      // hide all messages:
      $('.message').hide();

      // draw the board:
      for (var x = 0; x < 5; ++x)
      {
         for (var y = 0; y < 5; ++y)
         {
            cell = $('#' + cols[x] + rows[y]);
            switch (board[(4-y) * 5 + x])
            {
               // red stuff:
               case '.':
                  cell.append(rsq);
                  break;
               case 'r':
                  cell.append(rsq + rpn);
                  break;
               case 'R':
                  cell.append(rsq + rft);
                  break;
               case 'E':
                  cell.append(rsq + rft + rpn);
                  break;

               // blue stuff:
               case '_':
                  cell.append(bsq);
                  break;
               case 'b':
                  cell.append(bsq + bpn);
                  break;
               case 'B':
                  cell.append(bsq + bft);
                  break;
               case 'L':
                  cell.append(bsq + bft + bpn);
                  break;
               default:
                  break;
            }
         }
      }

      // can't use the loop variable directly because
      // it'll close over it
      function mkStep(step)
      {
         return function (e) { sendStep(step); }
      }


      if (data['bluPlayer'] == '')
      {
         $('#other-player').show();
      }
      else if (winner == null)
      {
         if (playingAs == whoseTurn)
         {
            $('#your-move').show();
         }
         else
         {
            $('#their-move').show();
         }

         // draw the valid steps:
         if (playingAs == whoseTurn)
         {
            for (var step in steps)
            {
               cell = $('#' + steps[step]);
               cell.append(stepImg[whoseTurn][step]);
               cell.select('.step').click(mkStep(step));
            }
         }

      }
      else
      {
         if (playingAs == winner)
            $('#you-won').show();
         else
            $('#you-lost').show();
      }
   };

   function sendStep(dir)
   {
      ChannelAPI.sendMessage('/move', "step="+dir);
   }

   return pub;
}(jQuery));
