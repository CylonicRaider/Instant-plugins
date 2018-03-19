
/* Instant image embedder functionality */

Instant.plugins.mailbox('embed-images').handle(function(data) {
  data.forEach(function(elem) {
    var re = new RegExp(elem[0]), subs = elem[1];
    Instant.message.parser.addEmbedder(re, function(url) {
      return $makeNode('a', 'embed-image', {href: url, target: '_blank'}, [
        ['img', 'embed-image', {src: url.replace(re, subs)}]
      ]);
    }, {normalize: true});
  });
});
