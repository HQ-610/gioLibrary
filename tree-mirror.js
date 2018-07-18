MutationSummary = require('mutation-summary');

var blacklistedTags = { "SCRIPT": 1, "STYLE": 1, "NOSCRIPT": 1, "IFRAME": 1, "BR": 1, "FONT": 1, "tspan": 1, "text": 1, "g": 1, "rect": 1, "path": 1, "defs": 1, "clipPath": 1, "desc": 1, "title": 1, "use": 1, 'math': 1 };
var listTags = ["TR", "LI", "DL"];
var blacklistedClassRegex = /^(clear|clearfix|active|hover|enabled|hidden|display|focus|disabled|ng-|growing-)/;
var supportedInputTypes = ['button', 'submit'];
var supportedClickTags = ["I", "SPAN", "EM", "svg"];
var supportedIconTags = ['A', 'BUTTON'];

var TreeMirrorClient = (function () {
  function TreeMirrorClient(target, mirror, testingQueries) {
    var _this = this;
    this.target = target;
    this.mirror = mirror;

    var children = [];
    for (var child = target.firstChild; child; child = child.nextSibling) {
      var d = this.serializeNode(child);
      if (d !== null) {
        children.push(d);
      }
    }

    setTimeout(function() { _this.mirror.initialize(children); }, 0);

    var self = this;

    var queries = [{ element: "*" }, { element: "*", elementAttributes: "data-growing-title src" }];

    if (testingQueries)
      queries = queries.concat(testingQueries);

    this.mutationSummary = new MutationSummary({
      rootNode: target,
      callback: function (summaries) {
        _this.applyChanged(summaries);
      },
      queries: queries
    });
  }

  TreeMirrorClient.prototype.disconnect = function () {
    if (this.mutationSummary) {
      this.mutationSummary.disconnect();
      this.mutationSummary = undefined;
    }
  };

  TreeMirrorClient.prototype.serializeNode = function (node, depth, parentIndex, parentObj) {
    if (node === null)
      return null;
    if (blacklistedTags[node.tagName] === 1)
      return null;

    if (depth === undefined) {
      depth = "/";
      var parent = node.parentElement;
      while (parent && parent.tagName !== "BODY" && parent.tagName !== "HTML") {
        var level = "/" + parent.tagName.toLowerCase();
        var parentId = parent.getAttribute("id");
        if (parentId && (parentId.match(/^[0-9]/) === null)) {
          level += "#" + parentId;
        }
        if (parent.hasAttribute("class")) {
          var klasses = parent.getAttribute("class").trim().split(/\s+/).sort();
          for (var i = 0; i < klasses.length; i++) {
            if (klasses[i].length > 0 && blacklistedClassRegex.exec(klasses[i]) === null) {
              level += "." + klasses[i];
            }
          }
        }
        depth = level + depth;
        parent = parent.parentElement;
      }
    }

    var data = {
      nodeType: node.nodeType
    };

    if (data.nodeType === 1 && supportedIconTags.indexOf(node.tagName) !== -1) {
      data.dom = node;
    }

    switch (data.nodeType) {
    case 10: // Node.DOCUMENT_TYPE_NODE:
      var docType = node;
      data.name = docType.name;
      data.publicId = docType.publicId;
      data.systemId = docType.systemId;
      break;

    case 8: // Node.COMMENT_NODE:
      return null;

    case 3: // Node.TEXT_NODE:
      if (depth === "/" || node.textContent.trim().length === 0) {
        return null;
      }
      data.textContent = node.textContent.replace(/[\n \t]+/g, " ").trim();
      if (data.textContent.length > 0) {
        data.leaf = true;
        data.text = data.textContent;
        data.path = depth.slice(0, -1);
      }
      break;

    case 1: // Node.ELEMENT_NODE:
      if (node.style) {
        var display = node.style.display;
        if (display !== "block" && display !== "inline" && (display === "none" || window.getComputedStyle(node).display === "none")) {
          if (node.tagName !== 'A' && node.querySelector('a') === null) {
            return null;
          }
        }
      }

      var elm = node;
      data.tagName = elm.tagName;
      data.attributes = { any: elm.hasAttributes() };
      depth += elm.tagName.toLowerCase();
      if (elm.hasAttribute('id') && elm.getAttribute('id').match(/^[0-9]/) === null)  {
        depth += "#" + elm.getAttribute('id');
      }
      if (elm.tagName == "INPUT" && elm.hasAttribute('name')) {
        depth += "." + elm.getAttribute('name');
      } else {
        if (elm.hasAttribute('class')) {
          klasses = elm.getAttribute('class').trim().split(/\s+/).sort();
          for (var i = 0; i < klasses.length; i++) {
            if (klasses[i].length > 0 && blacklistedClassRegex.exec(klasses[i]) === null) {
              depth += "." + klasses[i];
            }
          }
        }
      }
      if (elm.hasAttribute('href')) {
        data.attributes.href = elm.getAttribute('href');
      }

      var isLeaf = true;
      var isLeafNode;
      depth += "/";
      if (elm.childNodes.length > 0) {
        data.childNodes = [];

        if (elm.hasAttribute('growing-ignore') || elm.hasAttribute('data-growing-ignore')) {
          return null;
        } else {
          var idx = 0;
          var grObj;
          var grIdx;
          var isIconTag = (supportedIconTags.indexOf(elm.tagName) !== -1);
          if (isIconTag) {
            for (var iconChild = elm.firstChild; iconChild; iconChild = iconChild.nextSibling) {
              if (iconChild.nodeType === 1 && supportedClickTags.indexOf(iconChild.tagName) === -1) {
                isIconTag = false;
                break;
              }
            }
          }

          for (var child = elm.firstChild; child; child = child.nextSibling) {
            if (elm.hasAttribute('data-growing-info')) {
              grObj = elm.getAttribute('data-growing-info');
            } else {
              grObj = null;
            }
            if (elm.hasAttribute('data-growing-idx')) {
              grIdx = parseInt(elm.getAttribute('data-growing-idx'));
            } else {
              grIdx = -1;
            }
            if (child.nodeType === 1) {
              if (blacklistedTags[child.tagName] === 1) {
                isLeaf = false;
                continue;
              }

              if (child.hasAttribute('growing-ignore') || child.hasAttribute('data-growing-ignore')) {
                continue;
              }
              if (isIconTag && supportedClickTags.indexOf(child.tagName) !== -1) {
                isLeaf = false;
                continue;
              }

              if (listTags.indexOf(child.tagName) !== -1) {
                idx += 1;
                grIdx = idx;
              }
              if (child.hasAttribute('data-growing-idx')) {
                idx = parseInt(child.getAttribute('data-growing-idx'));
                grIdx = idx;
              }

              if (child.hasAttribute('data-growing-info')) {
                grObj = child.getAttribute('data-growing-info');
              }
            }

            var d = this.serializeNode(child, depth, (idx > 0 && grIdx > 0) ? idx : parentIndex, grObj || parentObj);

            if (d === null) {
              if (child.nodeType != 3) {
                isLeaf = false;
              }
            } else if (typeof(d.childNodes) !== "undefined") {
              isLeaf = false;
              isLeafNode = true;
              for (var j = 0; j < d.childNodes.length; j++) {
                if (d.childNodes[j].tagName) {
                  isLeafNode = false;
                  break;
                }
              }
              // if (isLeafNode) {
              if (idx > 0 && grIdx > 0) {
                d.idx = idx;
              } else if (parentIndex) {
                d.idx = parentIndex;
              }
              if (grObj) {
                d.obj = grObj;
              } else if (parentObj) {
                d.obj = parentObj;
              }
              // }
              data.childNodes.push(d);
            } else {
              if (elm.offsetWidth === 0 || elm.offsetHeight === 0) {
                if (elm.tagName !== 'A' && elm.tagName !== 'BUTTON') {
                  return null;
                }
              }
              if (d.leaf) {
                if (parentIndex) {
                  d.idx = parentIndex;
                }
                if (parentObj) {
                  d.obj = parentObj;
                }
                data.childNodes.push(d);
              }
            }
          }
        }
      } else {
        data.childNodes = [];
      }
      if (isLeaf) {
        data.leaf = true;
        if (elm.tagName === "IMG") {
          delete data.attributes.href;
          if (elm.src && elm.src.indexOf("data:image") === -1) {
            data.attributes.href = elm.src;
          }
        }
        if (elm.hasAttribute('data-growing-title') && elm.getAttribute('data-growing-title').length > 0) {
          data.text = elm.getAttribute('data-growing-title');
        } else if (elm.hasAttribute('title') && elm.getAttribute('title').length > 0) {
          data.text = elm.getAttribute('title');
        } else {
          if (elm.tagName === "IMG") {
            if (elm.alt) {
              data.text = elm.alt;
            } else if (data.attributes.href) {
              var imageUrl = data.attributes.href.split("?")[0];
              if (imageUrl) {
                var imageParts = imageUrl.split("/");
                if (imageParts.length > 0) {
                  data.text = imageParts[imageParts.length - 1];
                }
              }
            }
          } else if (elm.tagName === "INPUT" && supportedInputTypes.indexOf(elm.type) !== -1) {
            data.text = elm.value;
          } else if (elm.tagName === "svg") {
            for (var svgChild = elm.firstChild; svgChild; svgChild = svgChild.nextSibling) {
              if (svgChild.tagName === 'use' && svgChild.getAttribute("xlink:href")) {
                data.text = svgChild.getAttribute("xlink:href");
                break;
              }
            }
          } else {
            var textContent = elm.textContent.trim();
            if (textContent.length === 0 && elm.tagName !== "I" && elm.tagName !== 'A') {
              return null;
            } else {
              data.text = textContent;
            }
          }
        }
      } else {
        if (elm.hasAttribute('data-growing-title') && elm.getAttribute('data-growing-title').length > 0) {
          data.text = elm.getAttribute('data-growing-title');
        } else if (elm.hasAttribute('title') && elm.getAttribute('title').length > 0) {
          data.text = elm.getAttribute('title');
        }
        if (elm.hasAttribute('data-growing-idx')) {
          data.idx = parseInt(elm.getAttribute('data-growing-idx'));
        }
        if (elm.hasAttribute('data-growing-info')) {
          data.obj = elm.getAttribute('data-growing-info');
        }
      }
      data.path = depth.slice(0, -1);
      break;
    }

    return data;
  };

  TreeMirrorClient.prototype.serializeAddedAndMoved = function (added, reparented, reordered) {
    var _this = this;
    var all = added.concat(reparented).concat(reordered);

    if (all.length === 0) {
      return [];
    }

    var parentMap = new MutationSummary.NodeMap();
    var nodeSet = {};

    all.forEach(function (node) {
      if (node) {
        nodeSet[parentMap.nodeId(node)] = true;
      }
    });

    var rootList = [];
    all.forEach(function (node) {
      if (node && blacklistedTags[node.tagName] !== 1) {
        var parent = node.parentNode;
        if (parent && !nodeSet[parentMap.nodeId(parent)] && typeof(parent.getAttribute) !== "undefined") {
          var parentId = parent.getAttribute("id");
          var parentKlass = parent.getAttribute("class");
          var klass = node.getAttribute('class');
          if (parentId && (parentId.toLowerCase().indexOf("clock") !== -1 ||
                           parentId.toLowerCase().indexOf("countdown") !== -1 ||
                           parentId.toLowerCase().indexOf("time") !== -1)) {
          } else if (parentKlass && (parentKlass.toLowerCase().indexOf("clock") !== -1 ||
                                     parentKlass.toLowerCase().indexOf("countdown") !== -1 ||
                                     parentKlass.toLowerCase().indexOf("time") !== -1)) {
          } else if (parent.getAttribute('data-countdown')) {
          } else if (klass && klass.indexOf('daterangepicker') !== -1) {
          } else if (node.hasAttribute('growing-ignore') || node.hasAttribute('data-growing-ignore')) {
          } else {
            while (parent && parent !== document && parent.nodeName !== "#document-fragment" && parent.tagName !== "BODY" && !parent.hasAttribute("growing-ignore") && !parent.hasAttribute('data-growing-ignore')) {
              parent = parent.parentNode;
            }
            if (parent === null || parent.tagName === "BODY" || parent.nodeName === "#document-fragment") {
              rootList.push(node);
            }
          }
        }
      }
    });

    var moved = [];

    rootList.forEach(function (rootNode) {
      var parentIndex = undefined;
      var pnode = rootNode;
      while (pnode && pnode.tagName !== "BODY" && listTags.indexOf(pnode.tagName) === -1) {
        pnode = pnode.parentNode;
      }
      if (pnode && pnode.tagName !== "BODY") {
        var ppnode = pnode.parentNode;

        // 有可能计算到这一步时，pnode 被销毁，所以就不会找到 pnode.parentNode 。在如此短时间内被销毁，那么我们不应该计算 imp。
        if (ppnode == null) {
          return;
        }

        var idx = 1;
        for (var n = ppnode.childNodes[idx-1]; idx <= ppnode.childNodes.length; idx++) {
          if (n.tagName === pnode.tagName) {
            if (n === pnode) {
              parentIndex = idx;
              break;
            }
          }
        }
      }

      var data = _this.serializeNode(rootNode, undefined, parentIndex);
      if (data !== null) {
        moved.push(data);
      }
    });

    delete nodeSet;
    delete rootList;

    return moved;
  };

  TreeMirrorClient.prototype.serializeValueChanges = function (valueChanged) {
    var _this = this;
    var result = [];
    var map = new MutationSummary.NodeMap();

    valueChanged.forEach(function (element) {
      var record = map.get(element);
      if (!record) {
        record = _this.serializeNode(element);
        map.set(element, record);
      }
    });
    map.keys().forEach(function (node) {
      var res = map.get(node)
      if (res) {
        result.push(res);
      }
    });

    return result;
  };

  TreeMirrorClient.prototype.applyChanged = function (summaries) {
    var _this = this;
    var addedSummary = summaries[0];
    var added = addedSummary.added;
    var attributeChangedSummary = summaries[1];

    setTimeout(function () {
      var moved = _this.serializeAddedAndMoved(added, [], []);

      var valueChanged = [].concat(attributeChangedSummary.attributeChanged["data-growing-title"], attributeChangedSummary.attributeChanged["src"])
      if (valueChanged && valueChanged.length > 0) {
        var attributes = _this.serializeValueChanges(valueChanged);
        if (attributes && attributes.length > 0) {
          for (var i = 0; i < attributes.length; i++) {
            var attribute = attributes[i];
            if (attribute.text && attribute.text.length > 0) {
              moved = moved.concat(attribute);
            }
          }
        }
      }

      _this.mirror.applyChanged([], moved); // , attributes, text);
    }, 10);
  };

  return TreeMirrorClient;
})();

exports.Client = TreeMirrorClient;
