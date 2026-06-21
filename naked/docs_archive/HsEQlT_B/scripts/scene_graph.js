import glMatrix from "./glMatrix";
import { newShader } from "./gl_context";
import PriorityQueue from "./priority_queue";

const { mat4, vec3 } = glMatrix;

function inheritFrom(subClass, superClass) {
  // Making a new class with an empty constructor to use as a prototype.
  const inherited = function () {};
  inherited.prototype = superClass.prototype;
  subClass.prototype = new inherited();
}

export function readScript(script) {
  return script.innerHTML;
}

function degToRad(degrees) {
  return (degrees * Math.PI) / 180;
}

/**
 * A class that contains state global to a scene graph.
 *
 * @param gl the gl context.
 */
export function DrawingContext(gl) {
  this.gl = gl;
  this._shaderProgarm = null;
  this.vertexShaderStack = [];
  this.fragmentShaderStack = [];
  this.matrixStack = {};
  this.deltaMs = 0;
}
DrawingContext.prototype.IDENTITY = mat4.identity();

/**
 * Adds a new identical matrix to the stack wit the given id.
 *
 * @param id the id of the matrix stack to push
 * @returns the new matrix
 */
DrawingContext.prototype.pushMatrix = function (id) {
  var stack;
  if (!this.matrixStack[id]) {
    stack = this.matrixStack[id] = [];
  } else {
    stack = this.matrixStack[id];
  }

  var matrix;
  if (stack.length) {
    matrix = mat4.create(stack[stack.length - 1]);
  } else {
    matrix = mat4.create(this.IDENTITY);
  }
  stack.push(matrix);
  return matrix;
};

/**
 * Removes the last matrix from the stack with the given id.
 *
 * @param id the id of the matrix stack to pop.
 * @returns the matrix that is now on top.
 */
DrawingContext.prototype.popMatrix = function (id) {
  var stack = this.matrixStack[id];
  stack.pop();
  if (stack.length) {
    return stack[stack.length - 1];
  }
  return this.IDENTITY;
};

DrawingContext.prototype.getMatrix = function (id) {
  var stack = this.matrixStack[id];
  if (stack && stack.length) {
    return stack[stack.length - 1];
  }
  return this.IDENTITY;
};

/**
 * Pushes a new vertex shader on to the shader stack.
 *
 * @param id the id of the element containing the shader code.
 */
DrawingContext.prototype.pushVertexShader = function (id) {
  this._sharderProgram = null;
  this.vertexShaderStack.push(newShader(this.gl, id));
};

/**
 * Removes the current vertex shader from the stack.
 */
DrawingContext.prototype.popVertexShader = function () {
  this.vertexShaderStack.pop();
  this._sharderProgram = null;
};

/**
 * Pushes a new fragment shader on to the shader stack.
 *
 * @param id the id of the element containing the shader code.
 */
DrawingContext.prototype.pushFragmentShader = function (id) {
  this._sharderProgram = null;
  this.fragmentShaderStack.push(newShader(this.gl, id));
};

/**
 * Removes the current fragment shader from the stack.
 */
DrawingContext.prototype.popFragmentShader = function () {
  this.fragmentShaderStack.pop();
  this._sharderProgram = null;
};

/**
 * Returns the current shader program.
 *
 * This function lazily compiles the shader program if needed.
 * TODO: add caching.
 *
 * @returns the current shader program
 */
DrawingContext.prototype.getShaderProgram = function () {
  if (!this._shaderProgram) {
    var shaderProgram = this.gl.createProgram();
    this.gl.attachShader(
      shaderProgram,
      this.vertexShaderStack[this.vertexShaderStack.length - 1]
    );
    this.gl.attachShader(
      shaderProgram,
      this.fragmentShaderStack[this.fragmentShaderStack.length - 1]
    );
    this.gl.linkProgram(shaderProgram);
    if (!this.gl.getProgramParameter(shaderProgram, this.gl.LINK_STATUS)) {
      console.log("Could not initialize shaders");
      this.error = true;
    }
    this._shaderProgram = shaderProgram;
  }
  this.gl.useProgram(this._shaderProgram);
  return this._shaderProgram;
};
/**
 * Draws the given scene graph.
 *
 * @param root the root node of the scene graph
 */
DrawingContext.prototype.draw = function (root) {
  var timeNowMs = new Date().getTime();
  if (this.timeNowMs) {
    this.timeDeltaMs = timeNowMs - this.timeNowMs;
  }
  this.timeNowMs = timeNowMs;
  this.error = false;
  root.draw(this);
};

/**
 * A base class for a scene graph node with no children.
 */
function LeafNode() {}

/**
 * A base class for a scene graph node with children.
 *
 * TODO: Separate draw into enter and exit function to reduce
 * stack size while processing scene graph.
 */
function Node() {
  LeafNode.call(this);
  this.children = [];
}
inheritFrom(Node, LeafNode);

/**
 * Draws all nodes in Node.children.
 *
 * @param context the {@link DrawingContext} to use.
 */
Node.prototype.drawChildren = function (context) {
  for (const child in this.children) {
    this.children[child].draw(context);
  }
};

/**
 * Draws the current node.
 *
 * @param context the {@link DrawingContext} to use.
 */
Node.prototype.draw = function (context) {
  this.drawChildren(context);
};

/**
 * A node that sets the current vertex shader.
 *
 * @param shaderId The element id of the shader code to use
 */
function VertexShaderNode(shaderId) {
  Node.call(this);
  this.shaderId = shaderId;
}
inheritFrom(VertexShaderNode, Node);
VertexShaderNode.prototype.draw = function (context) {
  context.pushVertexShader(this.shaderId);
  this.drawChildren(context);
  context.popVertexShader();
};

/**
 * A node that sets the current fragment shader.
 *
 * @param shaderId The element id of the shader code to use
 */
function FragmentShaderNode(shaderId) {
  Node.call(this);
  this.shaderId = shaderId;
}
inheritFrom(FragmentShaderNode, Node);
FragmentShaderNode.prototype.draw = function (context) {
  context.pushFragmentShader(this.shaderId);
  this.drawChildren(context);
  context.popFragmentShader();
};

/**
 * A node that composes a string of nodes to appear as a single node.
 *
 * @param nodes An array of nodes to compose
 */
function ComposedNode(nodes) {
  LeafNode.call(this);
  // Linking nodes
  for (var i = 1; i < nodes.length; ++i) {
    nodes[i - 1].children.push(nodes[i]);
  }

  // Creating  "master node".
  this.children = nodes[nodes.length - 1].children;
  this._head_node = nodes[0];
}
inheritFrom(ComposedNode, LeafNode);
ComposedNode.prototype.draw = function (context) {
  this._head_node.draw(context);
};

/**
 * A helper node that sets initilizes a shader.
 *
 * @param vertexShaderId the element id of the vertex shader to use
 * @param fragmentShaderId the element id of the fragment shader to use
 * @param extraNodes an array of extra nodes required by the given shader
 */
export function ShaderNode(vertexShaderId, fragmentShaderId, extraNodes) {
  let nodes = [
    new VertexShaderNode(vertexShaderId),
    new FragmentShaderNode(fragmentShaderId)
  ];
  if (extraNodes) {
    nodes = nodes.concat(extraNodes);
  }
  ComposedNode.call(this, nodes);
}
inheritFrom(ShaderNode, ComposedNode);

/**
 * A class that wraps a static buffer.
 * @param item_size the number of element in each vertex
 * @param verticies the vertex values
 */
function StaticBufferAttribute(item_size, verticies) {
  this._verticies = verticies;
  this._itemSize = item_size;
  this.numItems = verticies.length / item_size;
}
/**
 * Sets the buffer as the given attribute.
 *
 * @param id the id of the attribute
 * @param context the {@link DrawingContext} to use
 */
StaticBufferAttribute.prototype.set = function (id, context) {
  var gl = context.gl;
  if (!this._buffer) {
    var buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array(this._verticies),
      gl.STATIC_DRAW
    );
    this._buffer = buffer;
  }
  var attribute = gl.getAttribLocation(context.getShaderProgram(), id);
  gl.enableVertexAttribArray(attribute);
  gl.bindBuffer(gl.ARRAY_BUFFER, this._buffer);
  gl.vertexAttribPointer(attribute, this._itemSize, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
};

/**
 * A node that draws geometry.
 *
 * @param type the type to pass to the gl.draw* call
 * @param numItems the number of vertexes in the geometry
 */
function DrawNode(type, numItems, element_array) {
  LeafNode.call(this);
  this.attributes = {};
  this._type = type;
  this._numItems = numItems;
  this._element_array = element_array;
}
inheritFrom(DrawNode, LeafNode);

DrawNode.prototype.draw = function (context) {
  for (const id in this.attributes) {
    this.attributes[id].set(id, context);
  }
  var gl = context.gl;
  if (!this._element_array) {
    gl.drawArrays(this._type, 0, this._numItems);
    return;
  }

  if (!this._element_buffer) {
    const elementBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, elementBuffer);
    gl.bufferData(
      gl.ELEMENT_ARRAY_BUFFER,
      new Uint16Array(this._element_array),
      gl.STATIC_DRAW
    );
    this._element_buffer = elementBuffer;
  }

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._element_buffer);
  gl.drawElements(this._type, this._numItems, gl.UNSIGNED_SHORT, 0);
};

/**
 * Creates a node that contains triangle geometry.
 *
 * @param gl the gl context to use
 * @param pos_id the id of the position attribute in the shader
 * @param tex_id optional id of the texture attribute in the shader
 * @returns {DrawNode}
 */
function newTriangle(gl, pos_id, tex_id) {
  var node = new DrawNode(gl.TRIANGLE_STRIP, 3);
  node.attributes[pos_id] = new StaticBufferAttribute(3, [
    0.0,
    1.0,
    0.0,
    -1.0,
    -1.0,
    0.0,
    1.0,
    -1.0,
    0.0
  ]);
  if (tex_id) {
    node.attributes[tex_id] = new StaticBufferAttribute(2, [
      0.5,
      1.0,
      0.0,
      0.0,
      1.0,
      0.0
    ]);
  }
  return node;
}

/**
 * Creates a node that contains square geometry.
 *
 * @param gl the gl context to use
 * @param pos_id the id of the position attribute in the shader
 * @param tex_id optional id of the texture attribute in the shader
 * @returns {DrawNode}
 */
function newSquare(gl, pos_id, tex_id) {
  var node = new DrawNode(gl.TRIANGLE_STRIP, 4);
  node.attributes[pos_id] = new StaticBufferAttribute(3, [
    1.0,
    1.0,
    0.0,
    -1.0,
    1.0,
    0.0,
    1.0,
    -1.0,
    0.0,
    -1.0,
    -1.0,
    0.0
  ]);

  if (tex_id) {
    node.attributes[tex_id] = new StaticBufferAttribute(2, [
      1.0,
      1.0,
      0.0,
      1.0,
      1.0,
      0.0,
      0.0,
      0.0
    ]);
  }
  return node;
}

/**
 * Creates a node that contains square geometry.
 *
 * @param gl the gl context to use
 * @param pos_id the id of the position attribute in the shader
 * @param tex_id optional id of the texture attribute in the shader
 * @returns {DrawNode}
 */
function newCube(gl, pos_id, tex_id) {
  var node = new DrawNode(gl.TRIANGLES, 36, [
    1,
    0,
    2,
    1,
    2,
    3, // back
    4,
    5,
    6,
    6,
    5,
    7, // front
    5,
    4,
    0,
    5,
    0,
    1, // bottom
    3,
    2,
    6,
    3,
    6,
    7, // top
    0,
    4,
    6,
    0,
    6,
    2, // left
    5,
    1,
    3,
    5,
    3,
    7 // right
  ]);
  node.attributes[pos_id] = new StaticBufferAttribute(3, [
    -1.0,
    -1.0,
    -1.0,
    1.0,
    -1.0,
    -1.0,
    -1.0,
    1.0,
    -1.0,
    1.0,
    1.0,
    -1.0,
    -1.0,
    -1.0,
    1.0,
    1.0,
    -1.0,
    1.0,
    -1.0,
    1.0,
    1.0,
    1.0,
    1.0,
    1.0
  ]);

  if (tex_id) {
    node.attributes[tex_id] = new StaticBufferAttribute(3, [
      0.0,
      0.0,
      0.0,
      1.0,
      0.0,
      0.0,
      0.0,
      1.0,
      0.0,
      1.0,
      1.0,
      0.0,
      0.0,
      0.0,
      1.0,
      1.0,
      0.0,
      1.0,
      0.0,
      1.0,
      1.0,
      1.0,
      1.0,
      1.0
    ]);
  }

  return node;
}

/**
 * A node that executes an arbitrary function.
 *
 * @param func A function that take a single {@link DrawingContext} as an
 * argument.
 * @param close_func An optional function that cleans up any state set by func
 */
export function FunctionNode(func, close_func) {
  Node.call(this);
  this._func = func;
  this._close_func = close_func;
}
inheritFrom(FunctionNode, Node);
FunctionNode.prototype.draw = function (context) {
  this._func.call(this, context);
  this.drawChildren(context);
  if (this._close_func) {
    this._close_func.call(this, context);
  }
};

/**
 * A node that pushes a new matrix value on to the given stack.
 *
 * @param matrix_id the id of the matrix stack to use
 * @param transform A function(matrix, context) that mutates the given matrix
 */
export function MatrixNode(matrix_id, transform) {
  Node.call(this);
  this.matrix_id = matrix_id;
  this.transform = transform;
}
inheritFrom(MatrixNode, Node);
MatrixNode.prototype.draw = function (context) {
  var matrix_loc = context.gl.getUniformLocation(
    context.getShaderProgram(),
    this.matrix_id
  );
  var matrix = context.pushMatrix(this.matrix_id);
  this.transform.call(this, matrix, context);
  context.gl.uniformMatrix4fv(matrix_loc, false, matrix);
  this.drawChildren(context);
  context.gl.uniformMatrix4fv(
    matrix_loc,
    false,
    context.popMatrix(this.matrix_id)
  );
};

/**
 * A node that populates a given texture.
 *
 * @param num the texture unit number to populate
 * @param src the location of image to use
 * @param id the id of the sampler to populate
 * @param filter the interpolation filter to use
 * @param wrap the type of wrapping to use
 */
export function TextureNode(num, src, id, filter, wrap) {
  Node.call(this);
  this._src = src;
  this._num = num;
  this._id = id;
  this._filter = filter;
  this._wrap = wrap;
}
inheritFrom(TextureNode, Node);
TextureNode.prototype.draw = function (context) {
  var gl = context.gl;
  if (!this._texture) {
    this._texture = gl.createTexture();
    this._image = new Image();
    this._image.crossOrigin = "";
    var node = this;
    this._image.onload = function () {
      node._load_texture(gl);
    };
    this._image.src = this._src;
  }
  if (!this._loaded) {
    return;
  }
  var loc = context.gl.getUniformLocation(context.getShaderProgram(), this._id);
  gl.uniform1i(loc, this._num);
  gl.activeTexture(gl.TEXTURE0 + this._num);
  gl.bindTexture(gl.TEXTURE_2D, this._texture);
  this.drawChildren(context);
};

TextureNode.prototype._load_texture = function (gl) {
  gl.bindTexture(gl.TEXTURE_2D, this._texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    this._image
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, this._filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, this._filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, this._wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, this._wrap);
  gl.bindTexture(gl.TEXTURE_2D, null);
  this._loaded = true;
};

export function LookAtCameraNode(canvas, worldMatrixId) {
  MatrixNode.call(this, worldMatrixId, function (dest) {
    mat4.set(this._matrix, dest);
    mat4.multiply(dest, this._delta_matrix);
  });

  this._matrix = mat4.lookAt([0, 0, 10], [0, 0, 0], [0, 1, 0]);
  this._delta_matrix = mat4.identity();
  var self = this;
  canvas.onmousedown = function (event) {
    self.startDrag(event);
  };
  canvas.onmouseup = function (event) {
    self.stopDrag(event);
  };
  canvas.onmousemove = function (event) {
    self.mouseMove(event);
  };
  canvas.onmousewheel = function (event) {
    self.mouseWheel(event);
  };
}
inheritFrom(LookAtCameraNode, MatrixNode);
LookAtCameraNode.prototype.startDrag = function (event) {
  this._is_drag = true;
  this._last_x = event.x;
  this._last_y = event.y;
};
LookAtCameraNode.prototype.stopDrag = function () {
  this._is_drag = false;
};
LookAtCameraNode.prototype.mouseMove = function (event) {
  if (!this._is_drag) {
    return;
  }
  const delta_x = event.x - this._last_x;
  const delta_y = event.y - this._last_y;
  var matrix = mat4.identity();
  mat4.rotateX(matrix, delta_y * 0.01);
  mat4.rotateY(matrix, delta_x * 0.01);
  mat4.multiply(matrix, this._delta_matrix, this._delta_matrix);
  this._last_x = event.x;
  this._last_y = event.y;
};
LookAtCameraNode.prototype.mouseWheel = function (event) {
  console.log();
  var matrix = mat4.identity();
  mat4.translate(matrix, vec3.createFrom(0, 0, event.wheelDeltaY / 240.0));
  mat4.multiply(this._matrix, matrix, this._matrix);
};

function getEyePosition(matrix) {
  const imatrix = mat4.inverse(matrix, mat4.create());
  return vec3.createFrom(imatrix[12], imatrix[13], imatrix[14]);
}

function getViewVector(matrix) {
  return vec3.normalize(vec3.createFrom(-matrix[2], -matrix[6], -matrix[10]));
}

export function SlicedCubeNode(
  modelViewMatrixId,
  sliceSpacing,
  posId,
  posCorners,
  texId,
  texCorners
) {
  LeafNode.call(this);
  this._modelViewMatrixId = modelViewMatrixId;
  this._sliceSpacing = sliceSpacing;
  this._posId = posId;
  this._posCorners = posCorners;
  this._texId = texId;
  this._texCorners = texCorners;
  this._viewVector = vec3.create();
}
inheritFrom(SlicedCubeNode, LeafNode);

SlicedCubeNode.prototype.draw = function (context) {
  var gl = context.gl;
  if (!this._element_buffer) {
    this._element_buffer = gl.createBuffer();
  }
  if (!this._pos_buffer) {
    this._pos_buffer = gl.createBuffer();
  }
  if (!this._tex_buffer) {
    this._tex_buffer = gl.createBuffer();
  }

  const matrix = context.getMatrix(this._modelViewMatrixId);
  const viewVector = getViewVector(matrix);
  if (!vec3.equal(viewVector, this._viewVector)) {
    this._viewVector = viewVector;
    this._slice();
    console.log(this._points);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._pos_buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array(this._points),
      gl.DYNAMIC_DRAW
    );
    gl.bindBuffer(gl.ARRAY_BUFFER, this._tex_buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array(this._texCoords),
      gl.DYNAMIC_DRAW
    );
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._element_buffer);
    gl.bufferData(
      gl.ELEMENT_ARRAY_BUFFER,
      new Uint16Array(this._indexes),
      gl.DYNAMIC_DRAW
    );
  }

  var pos_attr = gl.getAttribLocation(context.getShaderProgram(), this._posId);
  gl.enableVertexAttribArray(pos_attr);
  gl.bindBuffer(gl.ARRAY_BUFFER, this._pos_buffer);
  gl.vertexAttribPointer(pos_attr, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  var tex_attr = gl.getAttribLocation(context.getShaderProgram(), this._texId);
  gl.enableVertexAttribArray(tex_attr);
  gl.bindBuffer(gl.ARRAY_BUFFER, this._tex_buffer);
  gl.vertexAttribPointer(tex_attr, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._element_buffer);
  gl.drawElements(gl.TRIANGLES, this._indexes.length, gl.UNSIGNED_SHORT, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
};

SlicedCubeNode.prototype._slice = function () {
  this._points = [];
  this._texCoords = [];
  this._indexes = [];

  var cornerDistance = [];
  cornerDistance[0] = vec3.dot(this._posCorners[0], this._viewVector);
  var maxCorner = 0;
  var minDistance = cornerDistance[0];
  var maxDistance = cornerDistance[0];
  for (var i = 1; i < 8; ++i) {
    cornerDistance[i] = vec3.dot(this._posCorners[i], this._viewVector);
    if (cornerDistance[i] > maxDistance) {
      maxCorner = i;
      maxDistance = cornerDistance[i];
    }
    if (cornerDistance[i] < minDistance) {
      minDistance = cornerDistance[i];
    }
  }

  // Aligning slices
  var sliceDistance =
    Math.floor(maxDistance / this._sliceSpacing) * this._sliceSpacing;

  var activeEdges = [];
  var firstEdge = 0;
  var nextEdge = 0;
  var expirations = new PriorityQueue();

  var createEdge = function (startIndex, endIndex) {
    if (nextEdge >= 12) return undefined;
    var activeEdge = {
      expired: false,
      startIndex: startIndex,
      endIndex: endIndex
    };
    var range = cornerDistance[startIndex] - cornerDistance[endIndex];
    if (range != 0.0) {
      var irange = 1.0 / range;
      activeEdge.deltaPos = vec3.scale(
        vec3.subtract(
          this._posCorners[endIndex],
          this._posCorners[startIndex],
          vec3.create()
        ),
        irange
      );
      activeEdge.deltaTex = vec3.scale(
        vec3.subtract(
          this._texCorners[endIndex],
          this._texCorners[startIndex],
          vec3.create()
        ),
        irange
      );

      var step = cornerDistance[startIndex] - sliceDistance;
      activeEdge.pos = vec3.add(
        vec3.scale(activeEdge.deltaPos, step, vec3.create()),
        this._posCorners[startIndex]
      );
      activeEdge.tex = vec3.add(
        vec3.scale(activeEdge.deltaTex, step, vec3.create()),
        this._texCorners[startIndex]
      );

      vec3.scale(activeEdge.deltaPos, this._sliceSpacing);
      vec3.scale(activeEdge.deltaTex, this._sliceSpacing);
    }
    expirations.push(activeEdge, cornerDistance[endIndex]);
    activeEdge.cur = nextEdge;
    activeEdges[nextEdge++] = activeEdge;
    return activeEdge;
  };

  for (i = 0; i < 3; ++i) {
    var activeEdge = createEdge.call(
      this,
      maxCorner,
      this._cornerNeighbors[maxCorner][i]
    );
    activeEdge.prev = (i + 2) % 3;
    activeEdge.next = (i + 1) % 3;
  }

  var nextIndex = 0;
  while (sliceDistance > minDistance) {
    while (expirations.top().priority >= sliceDistance) {
      var edge = expirations.pop().object;
      if (edge.expired) {
        continue;
      }
      if (
        edge.endIndex != activeEdges[edge.prev].endIndex &&
        edge.endIndex != activeEdges[edge.next].endIndex
      ) {
        // split this edge.
        edge.expired = true;

        // create two new edges.
        var activeEdge1 = createEdge.call(
          this,
          edge.endIndex,
          this._incomingEdges[edge.endIndex][edge.startIndex]
        );
        activeEdge1.prev = edge.prev;
        activeEdges[edge.prev].next = nextEdge - 1;
        activeEdge1.next = nextEdge;

        var activeEdge2 = createEdge.call(
          this,
          edge.endIndex,
          this._incomingEdges[edge.endIndex][activeEdge1.endIndex]
        );
        activeEdge2.prev = nextEdge - 2;
        activeEdge2.next = edge.next;
        activeEdges[activeEdge2.next].prev = nextEdge - 1;
        firstEdge = nextEdge - 1;
      } else {
        // merge edge.
        var prev;
        var next;
        if (edge.endIndex == activeEdges[edge.prev].endIndex) {
          prev = activeEdges[edge.prev];
          next = edge;
        } else {
          prev = edge;
          next = activeEdges[edge.next];
        }
        prev.expired = true;
        next.expired = true;

        // make new edge
        var activeEdge = createEdge.call(
          this,
          edge.endIndex,
          this._incomingEdges[edge.endIndex][prev.startIndex]
        );
        activeEdge.prev = prev.prev;
        activeEdges[activeEdge.prev].next = nextEdge - 1;
        activeEdge.next = next.next;
        activeEdges[activeEdge.next].prev = nextEdge - 1;
        firstEdge = nextEdge - 1;
      }
    }

    var cur = firstEdge;
    var count = 0;
    do {
      ++count;
      var activeEdge = activeEdges[cur];
      this._points.push(activeEdge.pos[0]);
      this._points.push(activeEdge.pos[1]);
      this._points.push(activeEdge.pos[2]);
      this._texCoords.push(activeEdge.tex[0]);
      this._texCoords.push(activeEdge.tex[1]);
      this._texCoords.push(activeEdge.tex[2]);
      vec3.add(activeEdge.pos, activeEdge.deltaPos);
      vec3.add(activeEdge.tex, activeEdge.deltaTex);
      cur = activeEdge.next;
    } while (cur != firstEdge);
    for (i = 2; i < count; ++i) {
      this._indexes.push(nextIndex);
      this._indexes.push(nextIndex + i - 1);
      this._indexes.push(nextIndex + i);
    }
    nextIndex += count;
    sliceDistance -= this._sliceSpacing;
  }
};

SlicedCubeNode.prototype._cornerNeighbors = [
  [1, 2, 4],
  [0, 5, 3],
  [0, 3, 6],
  [1, 7, 2],
  [0, 6, 5],
  [1, 4, 7],
  [2, 7, 4],
  [3, 5, 6]
];

SlicedCubeNode.prototype._incomingEdges = [
  [-1, 2, 4, -1, 1, -1, -1, -1],
  [5, -1, -1, 0, -1, 3, -1, -1],
  [3, -1, -1, 6, -1, -1, 0, -1],
  [-1, 7, 1, -1, -1, -1, -1, 2],
  [6, -1, -1, -1, -1, 0, 5, -1],
  [-1, 4, -1, -1, 7, -1, -1, 1],
  [-1, -1, 7, -1, 2, -1, -1, 4],
  [-1, -1, -1, 5, -1, 6, 3, -1]
];
