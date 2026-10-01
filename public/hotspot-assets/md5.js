(function (root) {
  function md5Hex(input) {
    var text = unescape(encodeURIComponent(input));
    var bytes = [];
    var index;
    for (index = 0; index < text.length; index += 1) bytes.push(text.charCodeAt(index));
    var bitLength = bytes.length * 8;
    bytes.push(128);
    while (bytes.length % 64 !== 56) bytes.push(0);
    var lowLength = bitLength >>> 0;
    var highLength = Math.floor(bitLength / 4294967296) >>> 0;
    for (index = 0; index < 4; index += 1) bytes.push((lowLength >>> (index * 8)) & 255);
    for (index = 0; index < 4; index += 1) bytes.push((highLength >>> (index * 8)) & 255);

    var stateA = 1732584193;
    var stateB = -271733879;
    var stateC = -1732584194;
    var stateD = 271733878;
    var shifts = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];

    for (var offset = 0; offset < bytes.length; offset += 64) {
      var words = [];
      for (index = 0; index < 16; index += 1) {
        var wordOffset = offset + index * 4;
        words[index] = bytes[wordOffset] | (bytes[wordOffset + 1] << 8) | (bytes[wordOffset + 2] << 16) | (bytes[wordOffset + 3] << 24);
      }

      var a = stateA;
      var b = stateB;
      var c = stateC;
      var d = stateD;
      for (index = 0; index < 64; index += 1) {
        var f;
        var wordIndex;
        var shiftIndex;
        if (index < 16) {
          f = (b & c) | (~b & d);
          wordIndex = index;
          shiftIndex = index % 4;
        } else if (index < 32) {
          f = (d & b) | (~d & c);
          wordIndex = (5 * index + 1) % 16;
          shiftIndex = 4 + (index % 4);
        } else if (index < 48) {
          f = b ^ c ^ d;
          wordIndex = (3 * index + 5) % 16;
          shiftIndex = 8 + (index % 4);
        } else {
          f = c ^ (b | ~d);
          wordIndex = (7 * index) % 16;
          shiftIndex = 12 + (index % 4);
        }

        var constant = Math.floor(Math.abs(Math.sin(index + 1)) * 4294967296) | 0;
        var sum = (a + f + constant + words[wordIndex]) | 0;
        var shift = shifts[shiftIndex];
        var rotated = (sum << shift) | (sum >>> (32 - shift));
        var previousD = d;
        d = c;
        c = b;
        b = (b + rotated) | 0;
        a = previousD;
      }

      stateA = (stateA + a) | 0;
      stateB = (stateB + b) | 0;
      stateC = (stateC + c) | 0;
      stateD = (stateD + d) | 0;
    }

    function wordHex(word) {
      var result = '';
      for (var byteIndex = 0; byteIndex < 4; byteIndex += 1) {
        result += ('0' + ((word >>> (byteIndex * 8)) & 255).toString(16)).slice(-2);
      }
      return result;
    }

    return wordHex(stateA) + wordHex(stateB) + wordHex(stateC) + wordHex(stateD);
  }

  root.hexMD5 = md5Hex;
}(window));