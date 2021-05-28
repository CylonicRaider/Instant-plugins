#!/usr/bin/env python3
# -*- coding: ascii -*-

"""
An Instant bot for using the minigame plugin.
"""

import sys, re
import urllib.parse

import instabot

NICKNAME = 'GameBot'
HELP_TEXT = '''
Use "!game \u2039GAME-NAME\u203A @\u2039ANOTHER-USER\u203A" to start a game.
Known games are: {known_games}
'''[1:-1]

DEFAULT_GAMES = tuple('popCont tictactoe chicken'.split())

COMMAND_RE = re.compile(r'^!(\S+)(?:\s+(.*))?\s*$')
WHITESPACE_RE = re.compile(r'\s+')
LEADING_AT_RE = re.compile(r'^@')

def merge_tuples(*lists):
    ret, seen = [], set()
    for l in lists:
        for item in l:
            if item in seen: continue
            ret.append(item)
            seen.add(item)
    return tuple(ret)

class UserList:
    def __init__(self):
        self.users = {}

    def normalize_nick(self, name):
        return WHITESPACE_RE.sub('', name).lower()

    def add_user(self, uid, uuid):
        if uid in self.users and uuid:
            self.users[uid][0] = uuid
        else:
            self.users[uid] = [uuid, None, None]

    def remove_user(self, uid):
        self.users.pop(uid, None)

    def set_nick(self, uid, name):
        entry = self.users.get(uid)
        if entry: entry[1:2] = (self.normalize_nick(name), name)

    def get_uuid(self, uid):
        entry = self.users.get(uid)
        if not entry: return None
        return entry[0]

    def get_nick(self, uid):
        entry = self.users.get(uid)
        if not entry: return None
        return entry[2]

    def query_by_nick(self, name):
        name = self.normalize_nick(name)
        return {uid for uid, entry in self.users.items() if entry[1] == name}

    def uid_set_to_uuids(self, uids):
        return set(filter(None, map(self.get_uuid, uids)))

class GameBot(instabot.Bot):
    def __init__(self, *args, **kwds):
        instabot.Bot.__init__(self, *args, **kwds)
        self.known_games = kwds.get('known_games', ())
        if kwds.get('default_games', True):
            self.known_games = merge_tuples(DEFAULT_GAMES, self.known_games)
        self.users = UserList()

    def on_open(self):
        instabot.Bot.on_open(self)
        self.send_broadcast({'type': 'who'})

    def handle_joined(self, content, rawmsg):
        self.users.add_user(content['data']['id'], content['data']['uuid'])

    def handle_left(self, content, rawmsg):
        self.users.remove_user(content['data']['id'])

    def on_client_message(self, data, content, rawmsg):
        instabot.Bot.on_client_message(self, data, content, rawmsg)
        tp = data.get('type')
        if tp == 'nick':
            self.users.add_user(content['from'], data.get('uuid'))
            self.users.set_nick(content['from'], data.get('nick'))
        elif tp == 'post':
            msgid, sender = content['id'], content['from']
            nick, text = data.get('nick'), data.get('text')
            if nick is not None:
                self.users.set_nick(content['from'], nick)
            if not text:
                return
            reply = self.on_post(msgid, sender, text)
            if not reply:
                return
            self.send_post(reply, msgid)

    def on_post(self, msgid, sender, text):
        m = COMMAND_RE.match(text)
        if not m: return
        command, params = m.group(1), (m.group(2) or '').split()
        if command == 'ping' and params in ([], ['@GameBot']):
            return 'Pong!'
        elif command == 'help' and params == ['@GameBot']:
            return HELP_TEXT.format(
                known_games=(', '.join(self.known_games) or '(none)'))
        elif command == 'game':
            if len(params) != 2:
                return
            game_name, other_nick = params
            if game_name not in self.known_games:
                return 'Sorry, I do not know the game `{}`.'.format(game_name)
            other_nick = LEADING_AT_RE.sub('', other_nick)
            other_uuids = self.users.uid_set_to_uuids(
                self.users.query_by_nick(other_nick))
            if not other_uuids:
                return 'Sorry, I cannot find the user @{}.'.format(other_nick)
            elif len(other_uuids) > 2:
                return 'Sorry, there is more than one @{}.'.format(other_nick)
            other_uuid = next(iter(other_uuids))
            sender_nick = self.users.get_nick(sender)
            sender_uuid = self.users.get_uuid(sender)
            if sender_uuid is None:
                return 'Sorry, but who *are* you anyway?!'
            elif sender_uuid == other_uuid:
                return 'Sorry, but the other player may not be yourself.'
            return '<!{}>'.format(self.format_game_uri(game_name, sender_uuid,
                sender_nick, other_uuid, other_nick))

    def format_game_uri(self, game, player_A_uuid, player_A_name,
                        player_B_uuid, player_B_name):
        return 'game:{}/{},{}?{}'.format(
            game,
            urllib.parse.quote(player_A_uuid),
            urllib.parse.quote(player_B_uuid),
            urllib.parse.urlencode({'p0n': player_A_name,
                                    'p1n': player_B_name}))

def main():
    bb = instabot.CmdlineBotBuilder(botcls=GameBot, defnick=NICKNAME)
    p = bb.make_parser(sys.argv[0],
                       desc='An Instant bot for using the minigame plugin.')
    p.flag_ex('no-defaults', short='G', varname='default_games', default=True,
              value=False,
              help='Do not count the default games as known.')
    p.option('game', short='g', varname='known_games', default=[], accum=True,
             help='Add a game to the "known" list.')
    bb.parse(sys.argv[1:])
    bb.add_args('default_games', 'known_games')
    bot = bb()
    try:
        bot.run()
    except KeyboardInterrupt:
        sys.stderr.write('\n')
    finally:
        bot.close()

if __name__ == '__main__': main()
