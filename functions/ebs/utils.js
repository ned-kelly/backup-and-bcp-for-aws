
var getTags = function(tags) {
  return tags.reduce(function(final, current) {
    final[current.Key] = current.Value;
    return final;
  }, {});
}

var getDate = function(date) {
  return date.toISOString().split('T')[0];
}

exports.getTags = getTags;
exports.getDate = getDate;