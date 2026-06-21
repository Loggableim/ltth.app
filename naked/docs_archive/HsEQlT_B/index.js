// https://webgl-fire.appspot.com/html/fire.html
// https://web.cs.ucdavis.edu/~hamann/FullerKrishnanMahrousHamannJoyFirePaperFor_I3D2007AsSubmitted11012006.pdf
import glMatrix from "./scripts/glMatrix";
import { newGLContext } from "./scripts/gl_context";
import {
  DrawingContext,
  FunctionNode,
  LookAtCameraNode,
  MatrixNode,
  ShaderNode,
  SlicedCubeNode,
  TextureNode,
} from "./scripts/scene_graph";

const { mat4, vec3 } = glMatrix;

var gl = newGLContext("fire_canvas", true);
var context = new DrawingContext(gl);

gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);
gl.clearColor(0.0, 0.0, 0.0, 1.0);
gl.blendFunc(gl.ONE, gl.ONE);
//gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
gl.enable(gl.BLEND);

var projectionNode = new MatrixNode("projectionMatrix", function (
  matrix,
  context
) {
  mat4.perspective(
    45,
    context.gl.viewportWidth / context.gl.viewportHeight,
    0.1,
    100.0,
    matrix
  );
});

var cameraNode = new LookAtCameraNode(
  document.getElementById("fire_canvas"),
  "modelViewMatrix"
);

var modelViewNode = new MatrixNode("modelViewMatrix", function (mv) {
  //mat4.translate(mv, [-1.5, 0.0, 0]);
});

var shaderNode = new ShaderNode("shader-vs", "shader-fs", [
  new TextureNode(0, "/textures/nzw.png", "nzw", gl.LINEAR, gl.REPEAT),
  new TextureNode(
    1,
    "/textures/firetex.png",
    "fireProfile",
    gl.LINEAR,
    gl.CLAMP_TO_EDGE
  ),
  new FunctionNode(function (context) {
    if (!this.time) this.time = 0;
    var time_loc = context.gl.getUniformLocation(
      context.getShaderProgram(),
      "time"
    );
    this.time += context.timeDeltaMs;
    context.gl.uniform1f(time_loc, this.time / 1000.0);
    var eye_loc = context.gl.getUniformLocation(
      context.getShaderProgram(),
      "eye"
    );
    // context.gl.uniform3fv(eye_loc, cameraNode.getEyePosition());
  }),
]);

var volumeNode = new SlicedCubeNode(
  "modelViewMatrix",
  0.05,
  "pos",
  [
    vec3.createFrom(-1.0, -2.0, -1.0),
    vec3.createFrom(1.0, -2.0, -1.0),
    vec3.createFrom(-1.0, 2.0, -1.0),
    vec3.createFrom(1.0, 2.0, -1.0),
    vec3.createFrom(-1.0, -2.0, 1.0),
    vec3.createFrom(1.0, -2.0, 1.0),
    vec3.createFrom(-1.0, 2.0, 1.0),
    vec3.createFrom(1.0, 2.0, 1.0),
  ],
  "tex",
  [
    vec3.createFrom(0.0, 0.0, 0.0),
    vec3.createFrom(1.0, 0.0, 0.0),
    vec3.createFrom(0.0, 1.0, 0.0),
    vec3.createFrom(1.0, 1.0, 0.0),
    vec3.createFrom(0.0, 0.0, 1.0),
    vec3.createFrom(1.0, 0.0, 1.0),
    vec3.createFrom(0.0, 1.0, 1.0),
    vec3.createFrom(1.0, 1.0, 1.0),
  ]
);

// Constructing scene graph.
shaderNode.children.push(projectionNode);
projectionNode.children.push(cameraNode);
cameraNode.children.push(modelViewNode);
modelViewNode.children.push(volumeNode);

gl.enable(gl.CULL_FACE);
// Starting animation loop
tick(shaderNode, gl, context);

function tick(root, gl, context) {
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  context.draw(root);
  if (!context.error) {
    window.requestAnimationFrame(function () {
      tick(root, gl, context);
    });
  }
}
