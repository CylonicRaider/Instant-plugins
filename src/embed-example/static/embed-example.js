
/* Example embedder for testing purposes */

Instant.message.parser.addEmbedder(/^example:text\//, function(url) {
  var text = decodeURI(url.substr(13)).replace(/\+/g, ' ');
  var node = Instant.message.parser.makeNode(text);
  node.style.fontFamily = 'serif';
  return node;
});
