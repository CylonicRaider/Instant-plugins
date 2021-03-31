
/* Instant game plugin code */

this.InstantGames = function() {
  var GAME_URL_RE = /^game:([a-zA-Z0-9_-]+)\/([0-9a-fA-F,-]+)(?:[?#].*)?$/;

  var InstantGames = {
    games: {},
    register: function(name, data) {
      InstantGames.games[name] = data;
    }
  };

  Instant.message.embeds.addEmbedder(GAME_URL_RE, function(url) {
    var m = GAME_URL_RE.exec(url);
    var gameName = m[1], players = m[2].split(',');
    if (! players.every(Boolean)) {
      return $makeNode('span', 'game-error', [
        'Invalid ', ['code', 'monospace', 'game:'], ' URI'
      ]);
    }
    if (! InstantGames.games.hasOwnProperty(gameName))
      return $makeNode('span', 'game-error', [
        'Unknown game ', ['code', 'monospace', [$text(gameName)]]
      ]);
    return $makeNode('div', 'game-content', '...');
  }, {active: 'game'});

  Instant.plugins.mailbox('games.register').handle(function(data) {
    InstantGames.register(data[0], data[1]);
  });

  return InstantGames;
}();
