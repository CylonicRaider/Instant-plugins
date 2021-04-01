
/* Instant game plugin code */

this.InstantGames = function() {
  var GAME_URI_RE =
    /^game:([a-zA-Z0-9_-]+)\/([0-9a-fA-F,-]+)(?:\?([^#]*))?$/;

  function Game(embedInfo, name, players, params) {
    this.embedInfo = embedInfo;
    this.name = name;
    this.players = players;
    this.params = params;
    this.node = this.embedInfo.node;
    this.playerInfo = this.players.map(function(uuid, index) {
      return {uuid: uuid, name: this.params['p' + index + 'n']};
    }.bind(this));
    this.turn = null;
  }
  Game.prototype = {
    DISPLAY_NAME: null,
    REQUIRED_PLAYERS: null,
    init: function() {
      /* should be overridden */
    },
    getPlayerIndex: function(uuid) {
      var idx = this.players.indexOf(uuid);
      if (idx == -1) idx = null;
      return idx;
    },
    getSelfIndex: function() {
      return this.getPlayerIndex(Instant.identity.uuid);
    },
    render: function() {
      /* should be overridden */
    },
    setTurn: function(playerIndex) {
      /* overridden by TwoPlayerGame; may be overridden by others */
      this.turn = playerIndex;
    },
    _onInput: function(userID, text, live) {
      var m = /^([a-zA-Z0-9_-]+)(?:\s+([^]*))?$/.exec(text);
      if (! m) return;
      this.onInput(userID, m[1], (m[2] || '').trim(), live);
    },
    onInput: function(userID, command, value, live) {
      /* should be overridden */
    },
    send: function(command, value) {
      if (value == null) value = '';
      this.embedInfo.send(command + ((value) ? ' ' : '') + value);
    }
  };

  function TwoPlayerGame(embedInfo, name, players, params) {
    Game.call(this, embedInfo, name, players, params);
    this.playerInfo.forEach(function(item) {
      item.score = 0;
    });
  }
  TwoPlayerGame.prototype = Object.create(Game.prototype);
  TwoPlayerGame.prototype.REQUIRED_PLAYERS = 2;
  TwoPlayerGame.prototype.setTurn = function(playerIndex) {
    Game.prototype.setTurn.call(this, playerIndex);
    if (playerIndex == null) {
      this.node.removeAttribute('data-turn');
    } else {
      this.node.setAttribute('data-turn', playerIndex);
    }
  };
  TwoPlayerGame.prototype.render = function() {
    function makeNickNode(pi) {
      return (pi.name == null) ? Instant.nick.makeAnonymous() :
        Instant.nick.makeNode(pi.name);
    }
    this.node.appendChild($makeFrag(
      ['div', 'game-header', [
        makeNickNode(this.playerInfo[0]),
        ['span', 'separator', ' '],
        ['span', 'score score-0', '0'],
        ['span', 'separator', ' '],
        ['span', 'score', ':'],
        ['span', 'separator', ' '],
        ['span', 'score score-1', '0'],
        ['span', 'separator', ' '],
        makeNickNode(this.playerInfo[1])
      ]],
      ['div', 'game-body']
    ));
    var nicks = $clsAll('nick', this.node);
    nicks[0].classList.add('name-0');
    nicks[1].classList.add('name-1');
    this.node.addEventListener('click', function(event) {
      event.stopPropagation();
    });
  };
  TwoPlayerGame.prototype.addScore = function(index, points) {
    this.playerInfo[index].score += points;
    $sel('.game-header .score-' + index, this.node).textContent =
      this.playerInfo[index].score;
  };

  var InstantGames = {
    Game: Game,
    TwoPlayerGame: TwoPlayerGame,
    games: {},
    register: function(name, superConstructor, data) {
      function RegisteredGame(embedInfo, name, players, params) {
        superConstructor.call(this, embedInfo, name, players, params);
        this.init();
      }
      RegisteredGame.prototype = Object.create(superConstructor.prototype);
      for (var prop in data) {
        if (! data.hasOwnProperty(prop)) continue;
        RegisteredGame.prototype[prop] = data[prop];
      }
      InstantGames.games[name] = RegisteredGame;
    }
  };

  Instant.message.embeds.addEmbedder(GAME_URI_RE, function(url) {
    var m = GAME_URI_RE.exec(url);
    var gameName = m[1], players = m[2], params = m[3] || '';
    var splitPlayers = players.split(',');
    if (! splitPlayers.every(Boolean)) {
      return $makeNode('span', 'game-error', [
        'Invalid ', ['code', 'monospace', 'game:'], ' URI'
      ]);
    }
    if (! InstantGames.games.hasOwnProperty(gameName))
      return $makeNode('span', 'game-error', [
        'Unknown game ', ['code', 'monospace', [$text(gameName)]]
      ]);
    var needPlayers = InstantGames.games[gameName].prototype.REQUIRED_PLAYERS;
    if (needPlayers != null && splitPlayers.length != needPlayers)
      return $makeNode('span', 'game-error',
                       'Exactly ' + needPlayers + ' required');
    return $makeNode('div', 'game-root game-root-' + gameName,
                     {'data-name': gameName, 'data-players': players,
                      'data-params': params});
  }, {active: 'game', onInit: function(embed) {
    var name = embed.node.getAttribute('data-name');
    if (! name) return;
    var GameClass = InstantGames.games[name];
    embed.game = new GameClass(embed, name,
      embed.node.getAttribute('data-players').split(',')
        .map(decodeURIComponent),
      $query(embed.node.getAttribute('data-params')));
    embed.game.render();
  }, onData: function(embed, info) {
    if (! embed.game) return;
    embed.game._onInput(info.fromUUID, info.text, info.live);
  }});

  Instant.plugins.mailbox('games.register').handle(function(data) {
    var superConstructor = data.EXTENDS;
    if (superConstructor == null) {
      superConstructor = Game;
    } else if (typeof superConstructor == 'string') {
      superConstructor = InstantGames[superConstructor];
    }
    InstantGames.register(data.NAME, superConstructor, data);
  });

  return InstantGames;
}();

InstantGames.register('popCont', InstantGames.TwoPlayerGame, {
  DISPLAY_NAME: 'Popularity Contest',
  init: function() {
    this.proposalSent = {};
    this.voted = {};
  },
  render: function() {
    InstantGames.TwoPlayerGame.prototype.render.call(this);
    var index = this.getSelfIndex();
    $cls('game-body', this.node).appendChild($makeFrag(
      ['div', 'column', (index == 0) ? [
        ['span', 'header header-0', 'Your proposal:'],
        ['textarea', 'proposal proposal-0'],
        ['div', 'button-row', [
          ['button', 'button submit', 'Submit'],
          ' ',
          ['button', 'button vote vote-0', 'Vote']
        ]]
      ] : [
        ['div', 'header header-0', '\u2026proposes:'],
        ['div', 'proposal proposal-0'],
        ['button', 'button vote vote-0', 'Vote']
      ]],
      ['hr'],
      ['div', 'column', (index == 1) ? [
        ['span', 'header header-1', 'Your proposal:'],
        ['textarea', 'proposal proposal-1'],
        ['div', 'button-row', [
          ['button', 'button submit', 'Submit'],
          ' ',
          ['button', 'button vote vote-1', 'Vote']
        ]]
      ] : [
        ['div', 'header header-1', '\u2026proposes:'],
        ['div', 'proposal proposal-1'],
        ['button', 'button vote vote-1', 'Vote']
      ]]
    ));
    var myProposal = $sel('textarea.proposal', this.node);
    if (myProposal) {
      myProposal.addEventListener('keydown', function(event) {
        if (! this.proposalSent[this.getSelfIndex()] && event.keyCode == 13 &&
            ! event.shiftKey)
          this.send('proposal', myProposal.value);
      }.bind(this));
      $cls('submit', this.node).addEventListener('click', function(e) {
        if (! this.proposalSent[this.getSelfIndex()])
          this.send('proposal', myProposal.value);
      }.bind(this));
    }
    $cls('vote-0', this.node).addEventListener('click',
                                               this.onVote.bind(this, 0));
    $cls('vote-1', this.node).addEventListener('click',
                                               this.onVote.bind(this, 1));
  },
  onInput: function(userID, command, value, live) {
    var index = this.getPlayerIndex(userID);
    switch (command) {
      case 'proposal':
        if (this.proposalSent[index]) break;
        this.proposalSent[index] = true;
        var proposalNode = $cls('proposal-' + index, this.node);
        if (proposalNode.nodeName == 'TEXTAREA') {
          var newProposalNode = $makeNode('div', proposalNode.className);
          proposalNode.parentNode.insertBefore(newProposalNode, proposalNode);
          proposalNode.parentNode.removeChild(proposalNode);
          proposalNode = newProposalNode;
          var proposalButton = $cls('submit', this.node);
          if (proposalButton) {
            proposalButton.disabled = true;
          }
        }
        proposalNode.textContent = value;
        break;
      case 'vote':
        if (this.voted[userID]) break;
        var index = this.getPlayerIndex(value);
        if (index == null) break;
        this.addScore(index, 1);
        this.voted[userID] = true;
        if (userID == Instant.identity.uuid) {
          $cls('vote-0', this.node).disabled = true;
          $cls('vote-1', this.node).disabled = true;
        }
        break;
    }
  },
  onVote: function(index) {
    if (this.voted[Instant.identity.uuid]) return;
    var uuid = this.playerInfo[index].uuid;
    this.send('vote', uuid);
  }
});

InstantGames.register('tictactoe', InstantGames.TwoPlayerGame, {
  DISPLAY_NAME: 'Tic-tac-toe',
  LINES: [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ],
  init: function() {
    this.cells = [null, null, null,
                  null, null, null,
                  null, null, null];
    this.restarter = null;
  },
  getRole: function(playerIndex) {
    return (playerIndex == 0) ? 'x' : (playerIndex == 1) ? 'o' : '';
  },
  getSelfRole: function() {
    return this.getRole(this.getSelfIndex());
  },
  render: function() {
    function makeCellContents() {
      if (selfRole) {
        return [['button', 'button button-noborder', [
          crossNode.cloneNode(true),
          noughtNode.cloneNode(true)
        ]]];
      } else {
        return [
          crossNode.cloneNode(true),
          noughtNode.cloneNode(true)
        ];
      }
    }
    InstantGames.TwoPlayerGame.prototype.render.call(this);
    var crossNode = $makeNode('img', 'cross',
      {src: '/static/games/cross.svg', alt: 'x'});
    var noughtNode = $makeNode('img', 'nought',
      {src: '/static/games/nought.svg', alt: 'o'});
    var name0 = $cls('name-0', this.node);
    name0.parentNode.insertBefore(crossNode.cloneNode(true),
                                  name0.nextSibling);
    var name1 = $cls('name-1', this.node);
    name1.parentNode.insertBefore(noughtNode.cloneNode(true), name1);
    var selfIndex = this.getSelfIndex();
    var selfRole = this.getRole(selfIndex);
    var tcls = {x: 'is-crosses', o: 'is-noughts', '': ''}[selfRole];
    $cls('game-body', this.node).appendChild($makeFrag(
      ['div', 'filler'],
      ['table', tcls, [
        ['tr', [
          ['td', 'cell', {'data-cell': '0'}, makeCellContents()],
          ['td', 'cell', {'data-cell': '1'}, makeCellContents()],
          ['td', 'cell', {'data-cell': '2'}, makeCellContents()]
        ]],
        ['tr', [
          ['td', 'cell', {'data-cell': '3'}, makeCellContents()],
          ['td', 'cell', {'data-cell': '4'}, makeCellContents()],
          ['td', 'cell', {'data-cell': '5'}, makeCellContents()]
        ]],
        ['tr', [
          ['td', 'cell', {'data-cell': '6'}, makeCellContents()],
          ['td', 'cell', {'data-cell': '7'}, makeCellContents()],
          ['td', 'cell', {'data-cell': '8'}, makeCellContents()]
        ]]
      ]],
      ['button', 'button another-game', {disabled: 'disabled'},
        ['Another game']],
      ['div', 'filler']
    ));
    $sel('table', this.node).addEventListener('click', function(event) {
      if (selfIndex != this.turn) return;
      var curCellNode = $parentWithClass(event.target, 'cell');
      if (! curCellNode) return;
      var curCell = parseInt(curCellNode.getAttribute('data-cell'));
      if (this.cells[curCell] != null) return;
      this.send('move', selfRole + curCell);
    }.bind(this));
    $cls('another-game', this.node).addEventListener('click', function(e) {
      if (this.restarter == null || selfIndex != this.restarter) return;
      this.send('restart');
    }.bind(this));
    this.setTurn(0);
  },
  onInput: function(userID, command, value, live) {
    var index = this.getPlayerIndex(userID);
    switch (command) {
      case 'move':
        if (index != this.turn) break;
        if (!/^[xo][0-8]$/.test(value)) break;
        if (value[0] != this.getRole(index)) break;
        var cell = parseInt(value[1]);
        if (this.cells[cell] != null) break;
        this.cells[cell] = value[0];
        $sel('[data-cell="' + cell + '"]', this.node)
          .setAttribute('data-filled', value[0]);
        if (this.isOver(cell)) {
          this.addScore(index, 1);
        } else if (this.isMaybeDraw()) {
          /* NOP */
        } else {
          this.setTurn(1 - this.turn);
          break;
        }
        this.restarter = 1 - index;
        this.setTurn(null);
        if (this.getSelfIndex() == this.restarter) {
          $cls('another-game', this.node).disabled = false;
        }
        break;
      case 'restart':
        if (this.restarter == null || index != this.restarter) return;
        this.restart(this.restarter);
        break;
    }
  },
  isOver: function(cell) {
    var self = this, expectedValue = this.cells[cell];
    return this.LINES.some(function(line) {
      return line.indexOf(cell) != -1 && line.every(function(cell) {
        return (self.cells[cell] == expectedValue);
      });
    });
  },
  isMaybeDraw: function() {
    return this.cells.every(function(cell) { return cell != null; });
  },
  restart: function(startWith) {
    for (var i = 0; i < 9; i++) this.cells[i] = null;
    this.restarter = null;
    Array.prototype.forEach.call($selAll('.cell', this.node), function(cell) {
      cell.removeAttribute('data-filled');
    });
    $cls('another-game', this.node).disabled = true;
    this.setTurn(startWith);
  }
});
