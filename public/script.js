/*
 * trackball -- load a JSON object, display in virtual trackball
 * Created for CS352, Calvin College Computer Science
 *
 * object format is a simple JSON file with an array of vertex positions
 * and indices. All faces are assumed to be triangles.
 *
 * updated 2019 -- it does more for you
 *
 * Harry Plantinga -- February 2011
 *
 * Additions by Jesse Kuntz -- March 2019
 */

var vertices, faces, v;
var eyePoint = $V([0, 0, 1]);
var lightVector = $V([0, 0, -1]);
var ambient = 0.4;
var modelMat;	          // modeling matrx
var projectionMat;      // projection matrix
var rotationMat;        // rotation matrix
var moveMat;            // moved matrix
var trackball = {
  screenWidth:  450,
  screenHeight: 342,
  radius:       150,
};
var timeout;

$(document).ready(function () { trackball.init(); });

trackball.init = function () {
  $('#messages').html("Initializing<br>");
  trackball.canvas  = $('#canvas1')[0];
  trackball.cx = trackball.canvas.getContext('2d');
  trackball.cx.strokeStyle = 'rgb(150,60,30)';
  trackball.cx.fillStyle = 'rgb(220,220,220)';
  trackball.cx.lineWidth = 0.003;

  $('*').bind("change",trackball.display);
  $('#zoomSlider').bind("change",trackball.zoom);
  $('#object1').bind("change",trackball.load);
  $('#resetButton').bind("click",trackball.init);
  $('#perspectiveSlider').bind("input",trackball.setProjection);
  $('#perspectiveCheckbox').bind("change",trackball.setProjection);
  $('#canvas1').bind("mousedown",trackball.mouseDown);
  $('#canvas1').bind("mousemove",trackball.mouseMove);
  $('*').bind("mouseup",trackball.mouseUp);

  trackball.isTouched = false;
  trackball.firstX = 0;
  trackball.firstY = 0;
  trackball.firstZ = 0;

  // set world coords to (-1,-1) to (1,1) or so
  trackball.cx.setTransform(trackball.radius, 0, 0, -trackball.radius,
        trackball.screenWidth/2, trackball.screenHeight/2 );

  modelMat = Matrix.I(4);
  rotationMat = Matrix.I(4);
  moveMat = Matrix.I(4);
  trackball.setProjection();
  trackball.load();
  trackball.go();
}

/*
 * set up projection matrix
 */
trackball.setProjection = function() {
  var scale = $('#zoomSlider').val() / 100;
  var d = $('#perspectiveSlider').val();
  $('#perspectivepar').text("Persp. dist. " + d);
  if ($('#perspectiveCheckbox').attr('checked')) {
    projectionMat = Matrix.create([
      [1,0,0,0],
      [0,1,0,0],
      [0,0,1,0],
      [0,0,-1/d,1]
    ]);
  } else {
    projectionMat = Matrix.create([
      [1,0,0,0],
      [0,1,0,0],
      [0,0,1,0],
      [0,0,0,1]
    ]);
  }
}

/*
 * Get selected JSON object file
 */
trackball.load = function() {
  var objectURL = $('#object1').val();
  log("Loading " + $('#object1').val());

  $.getJSON(objectURL, function(data) {
    log("JSON file received");
    trackball.loadObject(data);
    trackball.display();
  });
}

/*
 * load object. Scale it to fit in sphere centered on origin, with radius 1.
 * result:
 *   vertices[i] -- array of sylvester vectors
 *   faces[i] -- array of polygons to display
 *            -- faces[i].indices[j] -- array of vertex indices of faces
 *            -- faces[i].Kd[j] -- array of three reflectivity values, r, g, and b
 */
trackball.loadObject = function(obj) {
  vertices = new Array();
  log("In loadObject<br>");

  // find min and max coordinate values;
  var mins = new Array(), maxes = new Array();
  for (var k=0; k<3; k++) {
    maxes[k]=-1e300, mins[k]=1e300;
    for (var i=0+k; i<obj.vertexPositions.length; i+=3) {
      if (maxes[k] < obj.vertexPositions[i]) maxes[k] = obj.vertexPositions[i];
      if (mins[k] > obj.vertexPositions[i]) mins[k] = obj.vertexPositions[i];
    }
    log("mins["+k+"]: " + mins[k] + " maxes["+k+"]: " + maxes[k]);
  }

  // normalize coordinates (center on origin, radius 1)]
  var dx = (mins[0] + maxes[0])/2;
  var dy = (mins[1] + maxes[1])/2;
  var dz = (mins[2] + maxes[2])/2;

  // make it a little smaller than 2x2 so it's more likely to fit in the circle
  var scaleFactor = Math.max(maxes[0]-mins[0], maxes[1]-mins[1], maxes[2]-mins[2]) * .85;
  for (var i=0; i<obj.vertexPositions.length; i+=3) {
    obj.vertexPositions[i] =   (obj.vertexPositions[i] - dx) / scaleFactor;
    obj.vertexPositions[i+1] = (obj.vertexPositions[i+1] - dy) / scaleFactor;
    obj.vertexPositions[i+2] = (obj.vertexPositions[i+2] - dz) / scaleFactor;
  }
  log(i/3 + " vertices");

  // make vertex positions into vertex array of sylvester vectors
  for (var i=0; i<obj.vertexPositions.length/3; i++) {
    vertices[i] = $V([obj.vertexPositions[3*i], obj.vertexPositions[3*i+1],
        obj.vertexPositions[3*i+2], 1]);
  }

  // make the faces array, with indices and Kd arrays as properties
  var f=0;
  groups = new Array();
  faces = new Array();
  for (var g=0; g<obj.groups.length; g++) {
    for (i=0; i<obj.groups[g].faces.length; i++) {
      faces[f] = {};
      faces[f].indices = obj.groups[g].faces[i];
      faces[f].Kd = obj.groups[g].Kd;
//    log("&nbsp;face " + i + ": " + faces[f].indices + " Kd: " + faces[f].Kd);
//    log("Group " + g + " (" + "Kd: " + obj.groups[g].Kd + "):");
      f++;
    }
  }
}

/*
 * sylvester doesn't have homogeneous transforms, sigh
 */
trackball.rotation = function(theta,n) {
    var m1 = Matrix.Rotation(theta,n);
    var m2 = Matrix.create([
        [m1.e(1,1), m1.e(1,2), m1.e(1,3), 0],
        [m1.e(2,1), m1.e(2,2), m1.e(2,3), 0],
        [m1.e(3,1), m1.e(3,2), m1.e(3,3), 0],
        [0, 0, 0, 1]]);
    return m2;
}

/*
 * display the object:
 *   - transform vertices according to modelview matrix
 *   - sort the faces (DONE)
 *   - light the faces (DONE)
 *   - divide by w (DONE)
 *   - draw the faces (with culling) (DONE)
 */
trackball.display = function() {
  trackball.cx.clearRect(-2,-2,4,4);    // erase and draw circle
  trackball.cx.beginPath();
  trackball.cx.arc(0,0,1,6.283,0,true);
  trackball.cx.stroke();

  v = new Array();                      // apply modeling matrix; result v
  var p;
  var m = projectionMat.multiply(modelMat);
  for (var i=0; i<vertices.length; i++)  {
    p =  m.multiply(vertices[i]);

    v[i] = $V([p.e(1) / p.e(4), p.e(2) / p.e(4), p.e(3) / p.e(4)]);
  }

  // create f[] array to store the order in which faces should be drawn.
  // To sort faces, you can just change the entries in f[]
  var f = new Array();
  for (i=0; i<faces.length; i++) {
    f[i] = i;
  }

  // Z-Sort for Hidden Surface Removal
  if ($('#sortCheckbox').attr('checked')) {
    let averages = [];
    for (i = 0; i < faces.length; i++) {
      let average = 0;
      for (j = 0; j < faces[i].indices.length; j++) {
        average += v[faces[i].indices[j]].e(3);
      }
      average = average / faces[i].indices.length;
      averages.push({face: i, average: average});
    }

    // This sorts from lowest z value to highest z value, so that the furthest away ones are drawn first
    averages.sort(function(a, b) {
      return a.average - b.average;
    });

    // Mutate the order based off of our other sorted array
    f = averages.map(a => a.face);
  }

  // display the faces
  var v1, v2, v3, faceNorm;
  for (i=0; i<faces.length; i++) {
    v1 = faces[f[i]].indices[0];
    v2 = faces[f[i]].indices[1];
    v3 = faces[f[i]].indices[2];
    let firstVec = v[v2].subtract(v[v1]);
    let secondVec = v[v3].subtract(v[v2]);
    faceNorm = firstVec.cross(secondVec);
    let dir = eyePoint.dot(faceNorm);

    // Backface Culling
    if ($('#cullCheckbox').attr('checked')) {
      if (dir > 0) continue;
    }

    // Frontface Culling
    if ($('#cullFrontCheckbox').attr('checked')) {
      if (dir < 0) continue;
    }

    // set face color to what was in the object file -- max 200
    var r=Math.floor(faces[f[i]].Kd[0] * 200);
    var g=Math.floor(faces[f[i]].Kd[1] * 200);
    var b=Math.floor(faces[f[i]].Kd[2] * 200);

    if ($('#lightCheckbox').attr('checked')) {
      let diffuse = faceNorm.toUnitVector().dot(lightVector);
      r = r * diffuse + ambient * r;
      g = g * diffuse + ambient * g;
      b = b * diffuse + ambient * b;
    }

    trackball.cx.fillStyle="rgb(" + r + "," + g + "," + b + ")";
    trackball.cx.strokeStyle="rgb(" + r + "," + g + "," + b + ")";

    // draw face
    trackball.cx.beginPath();
    trackball.cx.moveTo(v[faces[f[i]].indices[0]].e(1), v[faces[f[i]].indices[0]].e(2));
    for (j=1; j<faces[f[i]].indices.length; j++)
      trackball.cx.lineTo(v[faces[f[i]].indices[j]].e(1), v[faces[f[i]].indices[j]].e(2));
    trackball.cx.closePath();

    if ($('#strokeCheckbox').attr('checked'))
      trackball.cx.stroke();
    if ($('#fillCheckbox').attr('checked'))
      trackball.cx.fill();
  }
}

/*
 * tell JavaScript to call the animate function 100 times a second
 */
trackball.go = function() {
  intervalID = setInterval(trackball.animate, 10);
  $('#messages').append('Starting rotation');
  clock = 0;
}

/*
 * animate: set up the modeling matrix and call display
 */
trackball.animate = function() {
    clock = clock + 1;
    var scale = $('#zoomSlider').val() / 100;
    var axis = Vector.create([1,1,1]);
    modelMat = Matrix.Diagonal([scale,scale,scale,1]);
    modelMat = modelMat.multiply(rotationMat);
    // modelMat = modelMat.multiply(trackball.rotation(.002 * clock, axis ));
    trackball.display();
}

/*
 * this function doesn't really need to do anything -- it all happens in the
 * animate function. Of course, that means the zoom slider doesn't respond
 * to a changed value for up to 1/100 of a second...
 */
trackball.zoom = function(ev) {
  $('#zoom').text(($('#zoomSlider').val()/100).toFixed(2));
}

trackball.showVector = function(v) {
  return "[" + v.e(1).toFixed(2) + ", " + v.e(2).toFixed(2) + ", " + v.e(3).toFixed(2) + "]";
}

log = function(s) {
   if ($('#debugCheckbox').attr('checked'))
     $('#messages').append(s + "<br>");
}

trackball.mouseUp = function(e) {
  trackball.isTouched = false;
}

trackball.mouseMove = function(e) {
  if (trackball.isTouched === true) {
    let currentX = (e.pageX - $(trackball.canvas).offset().left - trackball.screenWidth / 2) / trackball.radius;
    let currentY = (e.pageY - $(trackball.canvas).offset().top - trackball.screenHeight / 2) / trackball.radius;
    let currentZ = 0;

    if(Math.pow(trackball.firstX, 2) + Math.pow(trackball.firstY, 2) <= 1) {
      currentZ = Math.sqrt(1 - Math.pow(trackball.firstX, 2) - Math.pow(trackball.firstY, 2));
    } else {
      currentZ = 0;
    }

    let initial = $V([trackball.firstX, trackball.firstY, trackball.firstZ]);
    let final = $V([currentX, currentY, currentZ]);

    // I know that it is normally initial.cross(final), but this feels more natural to me.
    let axis = final.cross(initial);
    let angle = initial.angleFrom(final);

    // If I don't do these checks, the object disappears.
    if (angle !== 0 && axis !== $V([0,0,0])) {
      rotationMat = trackball.rotation(angle, axis).multiply(rotationMat);

    }

    trackball.firstX = currentX;
    trackball.firstY = currentY;
    trackball.firstZ = currentZ;
  }
}

trackball.mouseDown = function(e) {
  trackball.isTouched = true;

  trackball.firstX = (e.pageX - $(trackball.canvas).offset().left - trackball.screenWidth / 2) / trackball.radius;
  trackball.firstY = (e.pageY - $(trackball.canvas).offset().top - trackball.screenHeight / 2) / trackball.radius;
  if(Math.pow(trackball.firstX, 2) + Math.pow(trackball.firstY, 2) <= 1) {
    trackball.firstZ = Math.sqrt(1 - Math.pow(trackball.firstX, 2) - Math.pow(trackball.firstY, 2));
  } else {
    trackball.firstZ = 0;
  }
}