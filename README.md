
Terratri Online
===============

This is an implementation of Adam "Atomic" Saltsman's abstract
strategy game, Terratri.

The game is described here:

   http://blog.adamatomic.com/post/44317021078/making-terratri-a-minimalist-territory-captur
   http://blog.adamatomic.com/post/44317019428/terratri-online-fatal-flaws-a-possible-soluti


Running Locally
---------------

Requires Python 3.9+.

    pip install -r requirements.txt
    python main.py

The server starts on http://localhost:5050.

To play:

  1. Open http://localhost:5050 and click "play".
  2. Copy the game link and open it in a second browser
     (or incognito window) to join as the second player.
  3. Take turns clicking the arrow icons to move.
  4. First to 5 forts wins.


Running Tests
-------------

    python -m pytest test.py


History
-------

Originally built in 2011 on Google App Engine (Python 2.5, Channel
API, Datastore). Modernized in 2026 to use Flask + Flask-SocketIO
with no remaining GAE dependencies. Game state is stored in memory;
swap in a database if you need persistence across restarts.


License
-------

MIT. See [LICENSE](LICENSE).
