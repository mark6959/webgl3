//=============================================================================
// SECTION 1: GLOBAL VARIABLES AND CONFIGURATION
//=============================================================================

// Core WebGL variables
var gl;                     // WebGL context
var vertices = [];          // Vertex data (x,y,z, r,g,b, u,v, nx,ny,nz)
var originalVertices = [];  // Original vertex data before modifiers
var mouseX = 0, mouseY = 0; // Mouse tracking
var angle = [0.0, 0.0, 0.0, 1.0]; // Rotation angles [x, y, unused, unused]
var textures = {};          // Texture cache

// Camera and view settings
var projectionParams = {
    fov: 45 * Math.PI / 180,
    aspect: 1,
    near: 0.1,
    far: 100.0
};

// Geometry modifier settings
var modifiers = {
    bend: {
        enabled: false,
        x: { enabled: false, angle: 0 },
        y: { enabled: false, angle: 0 },
        z: { enabled: false, angle: 0 }
    },
    twist: {
        enabled: false,
        x: { enabled: false, angle: 0 },
        y: { enabled: false, angle: 0 },
        z: { enabled: false, angle: 0 }
    },
    taper: {
        enabled: false,
        x: { enabled: false, amount: 0 },
        y: { enabled: false, amount: 0 },
        z: { enabled: false, amount: 0 }
    },
    bulge: {
        enabled: false,
        x: { enabled: false, amount: 0 },
        y: { enabled: false, amount: 0 },
        z: { enabled: false, amount: 0 }
    }
};

// Shader uniform locations
var angleGL = null;
var uProjectionMatrixGL = null;
var uViewMatrixGL = null;

//=============================================================================
// SECTION 2: INITIALIZATION AND SETUP
//=============================================================================
// Initialize WebGL context and setup
function InitWebGL() {
    const canvas = document.getElementById('gl');
    gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) { alert('WebGL not supported'); return; }

    // Ensure canvas dimensions match display size
    if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
        gl.viewport(0, 0, canvas.width, canvas.height);
    }

    projectionParams.aspect = canvas.width / canvas.height;

    InitializeUI();
    setupMouseInteraction(canvas);
    InitViewport();
    InitShaders();
}

// Set up UI controls with current values
function InitializeUI() {
    const inputs = {
        fov: document.getElementById('fov'),
        near: document.getElementById('near'),
        far: document.getElementById('far')
    };

    // Update projection inputs
    if (inputs.fov) {
        inputs.fov.value = Math.round(projectionParams.fov * 180 / Math.PI);
        document.getElementById('fov-value').textContent = inputs.fov.value + '°';
    }
    if (inputs.near) {
        inputs.near.value = projectionParams.near;
        document.getElementById('near-value').textContent = inputs.near.value;
    }
    if (inputs.far) {
        inputs.far.value = projectionParams.far;
        document.getElementById('far-value').textContent = inputs.far.value;
    }

    // Helper for setting up modifier UI controls
    function initModifierControls(modType, valueType, valueSuffix = '') {
        const mainToggle = document.getElementById(`${modType}-toggle`);
        if (mainToggle) {
            mainToggle.checked = modifiers[modType].enabled;
        }

        ['x', 'y', 'z'].forEach(axis => {
            const axisToggle = document.getElementById(`${modType}-${axis}-toggle`);
            const axisValue = document.getElementById(`${modType}-${axis}-${valueType}`);
            const valueDisplay = document.getElementById(`${modType}-${axis}-${valueType}-value`);

            if (axisToggle) {
                axisToggle.checked = modifiers[modType][axis].enabled;
                axisToggle.disabled = !modifiers[modType].enabled;
            }

            if (axisValue) {
                axisValue.value = modifiers[modType][axis][valueType];
                axisValue.disabled = !modifiers[modType].enabled ||
                                    (axisToggle && !axisToggle.checked);

                if (valueDisplay) {
                    valueDisplay.textContent = axisValue.value + valueSuffix;
                }
            }
        });
    }

    initModifierControls('bend', 'angle', '°');
    initModifierControls('twist', 'angle', '°');
    initModifierControls('taper', 'amount');
    initModifierControls('bulge', 'amount');
}

// Configure WebGL rendering settings
function InitViewport() {
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(0.0, 0.4, 0.6, 1.0);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
}

// Initialize and compile shaders
function InitShaders() {
    const vertexShader = InitVertexShader();
    const fragmentShader = InitFragmentShader();

    if (!vertexShader || !fragmentShader) {
        console.error("Shader creation failed.");
        return;
    }

    const shaderProgram = InitShaderProgram(vertexShader, fragmentShader);
    if (!shaderProgram) {
        console.error("Shader program creation failed.");
        return;
    }

    ValidateShaderProgram(shaderProgram);
    gl.useProgram(shaderProgram);

    // Load texture and create geometry
    if (!woodTexture) {
        LoadTexture(gl, 'Pictures/wooden-box-3d-model-fbx-blend.jpg', function(texture) {
            woodTexture = texture;
            CreateGeometryBuffers(shaderProgram);
        });
    } else {
        CreateGeometryBuffers(shaderProgram);
    }
}

// Set up mouse rotation controls
function setupMouseInteraction(canvas) {
    canvas.addEventListener('mousemove', function(e) {
        if (e.buttons === 1) {
            let deltaY = e.clientY - mouseY;
            let deltaX = e.clientX - mouseX;
            angle[0] += deltaY * 0.01;
            angle[1] += deltaX * 0.01;
            angle[1] = angle[1] % (2 * Math.PI); // Keep angle in reasonable range

            if (angleGL !== null) {
                gl.uniform4fv(angleGL, new Float32Array(angle));
                Render();
            }
        }
        mouseX = e.clientX;
        mouseY = e.clientY;
    });

    canvas.addEventListener('contextmenu', function(e) {
        e.preventDefault();
    });
}

//=============================================================================
// SECTION 3: SHADER COMPILATION AND MANAGEMENT
//=============================================================================

// Compile a shader from source
function createShader(id, type) {
    const sourceElement = document.getElementById(id);
    if (!sourceElement) return null;

    const shader = gl.createShader(type);
    gl.shaderSource(shader, sourceElement.value);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(`Shader Compile Error (${id}):`, gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

// Create vertex shader
function InitVertexShader() {
    return createShader('vs', gl.VERTEX_SHADER);
}

// Create fragment shader
function InitFragmentShader() {
    return createShader('fs', gl.FRAGMENT_SHADER);
}

// Link shaders into a program
function InitShaderProgram(vertexShader, fragmentShader) {
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error('Link Error:', gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
        return null;
    }
    return program;
}

// Validate shader program
function ValidateShaderProgram(program) {
    gl.validateProgram(program);
    if (!gl.getProgramParameter(program, gl.VALIDATE_STATUS)) {
        console.error('Validation Error:', gl.getProgramInfoLog(program));
    }
    return true;
}

//=============================================================================
// SECTION 4: GEOMETRY GENERATION
//=============================================================================

// Add a single vertex to the buffer
function AddVertex(x, y, z, r, g, b, u = 0, v = 0, nx = 0, ny = 0, nz = 1) {
    vertices.push(x, y, z, r, g, b, u, v, nx, ny, nz);
}

// Add a triangle (3 vertices)
function AddTriangle(
    x1, y1, z1, r1, g1, b1, u1 = 0, v1 = 0, nx1 = 0, ny1 = 0, nz1 = 1,
    x2, y2, z2, r2, g2, b2, u2 = 0, v2 = 0, nx2 = 0, ny2 = 0, nz2 = 1,
    x3, y3, z3, r3, g3, b3, u3 = 0, v3 = 0, nx3 = 0, ny3 = 0, nz3 = 1
) {
    AddVertex(x1, y1, z1, r1, g1, b1, u1, v1, nx1, ny1, nz1);
    AddVertex(x2, y2, z2, r2, g2, b2, u2, v2, nx2, ny2, nz2);
    AddVertex(x3, y3, z3, r3, g3, b3, u3, v3, nx3, ny3, nz3);
}

// Add a quad (2 triangles)
function AddQuad(
    x1, y1, z1, r1, g1, b1, u1 = 0, v1 = 0, nx1 = 0, ny1 = 0, nz1 = 1,
    x2, y2, z2, r2, g2, b2, u2 = 0, v2 = 0, nx2 = 0, ny2 = 0, nz2 = 1,
    x3, y3, z3, r3, g3, b3, u3 = 0, v3 = 0, nx3 = 0, ny3 = 0, nz3 = 1,
    x4, y4, z4, r4, g4, b4, u4 = 0, v4 = 0, nx4 = 0, ny4 = 0, nz4 = 1
) {
    // First triangle
    AddTriangle(
        x1, y1, z1, r1, g1, b1, u1, v1, nx1, ny1, nz1,
        x2, y2, z2, r2, g2, b2, u2, v2, nx2, ny2, nz2,
        x3, y3, z3, r3, g3, b3, u3, v3, nx3, ny3, nz3
    );
    // Second triangle
    AddTriangle(
        x3, y3, z3, r3, g3, b3, u3, v3, nx3, ny3, nz3,
        x4, y4, z4, r4, g4, b4, u4, v4, nx4, ny4, nz4,
        x1, y1, z1, r1, g1, b1, u1, v1, nx1, ny1, nz1
    );
}
//=============================================================================
// SECTION 5: SHAPE CREATION
//=============================================================================

// Create a 2D triangle
function CreateTriangle(width, height) {
    vertices.length = 0;
    const w = width * 0.5;
    const h = height * 0.5;

    AddTriangle(
        0.0,  h, 0.0, 1.0, 0.0, 0.0, 0.5, 0.0, 0.0, 0.0, 1.0, // Top (red)
        -w, -h, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0,  // Bottom-left (green)
        w,  -h, 0.0, 0.0, 0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 1.0   // Bottom-right (blue)
    );

    originalVertices = [...vertices];
}

// Create a 2D quad/rectangle
function CreateQuad(width, height) {
    vertices.length = 0;
    const w = width * 0.5;
    const h = height * 0.5;

    AddQuad(
        -w,  h, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, // Top-left (red)
        -w, -h, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, // Bottom-left (green)
        w,  -h, 0.0, 0.0, 0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 1.0, // Bottom-right (blue)
        w,   h, 0.0, 1.0, 1.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0  // Top-right (yellow)
    );

    originalVertices = [...vertices];
}

// Create a 3D cube with subdivided faces
function CreateCube(size, divsX, divsY, divsZ, useCheckerboard) {
    vertices.length = 0;
    const s = size * 0.5;
    divsX = Math.max(1, Math.floor(divsX));
    divsY = Math.max(1, Math.floor(divsY));
    divsZ = Math.max(1, Math.floor(divsZ));

    // Define colors
    const white = [1.0, 1.0, 1.0];
    const black = [0.0, 0.0, 0.0];
    const faceColors = { // Colors for flat faces
        front:  [1.0, 0.0, 0.0], // +Z Red
        back:   [1.0, 0.0, 1.0], // -Z Pink
        top:    [1.0, 1.0, 0.0], // +Y Yellow
        bottom: [0.0, 1.0, 1.0], // -Y Cyan
        right:  [0.0, 0.0, 1.0], // +X Blue
        left:   [0.0, 1.0, 0.0]  // -X Green
    };

    // Define face normals
    const faceNormals = {
        front:  [0, 0, 1],   // +Z
        back:   [0, 0, -1],  // -Z
        top:    [0, 1, 0],   // +Y
        bottom: [0, -1, 0],  // -Y
        right:  [1, 0, 0],   // +X
        left:   [-1, 0, 0]   // -X
    };

    // Helper to add a face with subdivision
    const addSubdividedFace = (faceName, normalAxis, normalSign, uAxis, vAxis, divsU, divsV) => {
        const stepU = size / divsU;
        const stepV = size / divsV;
        const flatColor = faceColors[faceName]; // Get the color for this face
        const normal = faceNormals[faceName]; // Get the normal for this face

        for (let i = 0; i < divsU; i++) {
            for (let j = 0; j < divsV; j++) {
                let corners = [{}, {}, {}, {}];
                let u0 = -s + i * stepU;
                let v0 = -s + j * stepV;
                let u1 = u0 + stepU;
                let v1 = v0 + stepV;

                // Calculate UV coordinates (normalized from 0 to 1)
                let texU0 = i / divsU;
                let texV0 = j / divsV;
                let texU1 = (i + 1) / divsU;
                let texV1 = (j + 1) / divsV;

                const assignCoords = (corner, uVal, vVal) => {
                    corner[uAxis] = uVal;
                    corner[vAxis] = vVal;
                    corner[normalAxis] = s * normalSign;
                };

                assignCoords(corners[0], u0, v0);
                assignCoords(corners[1], u1, v0);
                assignCoords(corners[2], u1, v1);
                assignCoords(corners[3], u0, v1);

                // *** COLOR LOGIC ***
                let color;
                if (useCheckerboard) {
                    color = (i + j) % 2 === 0 ? white : black;
                } else {
                    color = flatColor; // Use the predetermined flat color for the face
                }

                // Define quad vertices based on face orientation (winding order)
                if (normalAxis === 'z') {
                    if (normalSign > 0)
                        AddQuad(
                            corners[0].x, corners[0].y, corners[0].z, ...color, texU0, texV0, ...normal,
                            corners[1].x, corners[1].y, corners[1].z, ...color, texU1, texV0, ...normal,
                            corners[2].x, corners[2].y, corners[2].z, ...color, texU1, texV1, ...normal,
                            corners[3].x, corners[3].y, corners[3].z, ...color, texU0, texV1, ...normal
                        );
                    else
                        AddQuad(
                            corners[1].x, corners[1].y, corners[1].z, ...color, texU0, texV0, ...normal,
                            corners[0].x, corners[0].y, corners[0].z, ...color, texU1, texV0, ...normal,
                            corners[3].x, corners[3].y, corners[3].z, ...color, texU1, texV1, ...normal,
                            corners[2].x, corners[2].y, corners[2].z, ...color, texU0, texV1, ...normal
                        );
                }
                else if (normalAxis === 'y') {
                    if (normalSign > 0)
                        AddQuad(
                            corners[3].x, corners[3].y, corners[3].z, ...color, texU0, texV0, ...normal,
                            corners[2].x, corners[2].y, corners[2].z, ...color, texU1, texV0, ...normal,
                            corners[1].x, corners[1].y, corners[1].z, ...color, texU1, texV1, ...normal,
                            corners[0].x, corners[0].y, corners[0].z, ...color, texU0, texV1, ...normal
                        );
                    else
                        AddQuad(
                            corners[0].x, corners[0].y, corners[0].z, ...color, texU0, texV0, ...normal,
                            corners[1].x, corners[1].y, corners[1].z, ...color, texU1, texV0, ...normal,
                            corners[2].x, corners[2].y, corners[2].z, ...color, texU1, texV1, ...normal,
                            corners[3].x, corners[3].y, corners[3].z, ...color, texU0, texV1, ...normal
                        );
                }
                else {
                    if (normalSign > 0)
                        AddQuad(
                            corners[0].x, corners[0].y, corners[0].z, ...color, texU0, texV0, ...normal,
                            corners[3].x, corners[3].y, corners[3].z, ...color, texU0, texV1, ...normal,
                            corners[2].x, corners[2].y, corners[2].z, ...color, texU1, texV1, ...normal,
                            corners[1].x, corners[1].y, corners[1].z, ...color, texU1, texV0, ...normal
                        );
                    else
                        AddQuad(
                            corners[1].x, corners[1].y, corners[1].z, ...color, texU0, texV0, ...normal,
                            corners[2].x, corners[2].y, corners[2].z, ...color, texU0, texV1, ...normal,
                            corners[3].x, corners[3].y, corners[3].z, ...color, texU1, texV1, ...normal,
                            corners[0].x, corners[0].y, corners[0].z, ...color, texU1, texV0, ...normal
                        );
                }
            }
        }
    };

    // Generate faces using the helper
    addSubdividedFace('front', 'z',  1, 'x', 'y', divsX, divsY); // Front (+Z)
    addSubdividedFace('back',  'z', -1, 'x', 'y', divsX, divsY); // Back (-Z)
    addSubdividedFace('top',   'y',  1, 'x', 'z', divsX, divsZ); // Top (+Y)
    addSubdividedFace('bottom','y', -1, 'x', 'z', divsX, divsZ); // Bottom (-Y)
    addSubdividedFace('right', 'x',  1, 'z', 'y', divsZ, divsY); // Right (+X)
    addSubdividedFace('left',  'x', -1, 'z', 'y', divsZ, divsY); // Left (-X)

    // Store original vertices for modifiers
    originalVertices = [...vertices];
}

/**
 * Creates a 3D cylinder using Math.sin() and Math.cos().
 * @param {number} radius The radius of the cylinder.
 * @param {number} height The height of the cylinder.
 * @param {number} segments The number of segments around the cylinder.
 * @param {boolean} useCheckerboard True to use checkerboard, false for gradient colors.
 */
function CreateCylinder(radius, height, segments, useCheckerboard) {
    vertices.length = 0;
    segments = Math.max(3, Math.floor(segments)); // Minimum 3 segments
    const h = height * 0.5;

    // Colors
    const topColor = [1.0, 1.0, 0.0];    // Yellow
    const bottomColor = [0.0, 1.0, 1.0]; // Cyan
    const sideColor1 = [1.0, 0.0, 0.0];  // Red
    const sideColor2 = [0.0, 0.0, 1.0];  // Blue

    // Create top and bottom caps
    for (let i = 0; i < segments; i++) {
        const angle1 = (i / segments) * Math.PI * 2;
        const angle2 = ((i + 1) / segments) * Math.PI * 2;

        const x1 = Math.cos(angle1) * radius;
        const z1 = Math.sin(angle1) * radius;
        const x2 = Math.cos(angle2) * radius;
        const z2 = Math.sin(angle2) * radius;

        // UV coordinates for texture mapping
        const u1 = (Math.cos(angle1) + 1) * 0.5;
        const v1 = (Math.sin(angle1) + 1) * 0.5;
        const u2 = (Math.cos(angle2) + 1) * 0.5;
        const v2 = (Math.sin(angle2) + 1) * 0.5;

        // Top cap (center to edge, counter-clockwise)
        const topColor1 = useCheckerboard && i % 2 === 0 ? [1.0, 1.0, 1.0] : topColor;
        const topColor2 = useCheckerboard && i % 2 === 0 ? [1.0, 1.0, 1.0] : topColor;

        AddTriangle(
            0, h, 0, ...topColor1, 0.5, 0.5, 0, 1, 0,
            x1, h, z1, ...topColor1, u1, v1, 0, 1, 0,
            x2, h, z2, ...topColor2, u2, v2, 0, 1, 0
        );

        // Bottom cap (center to edge, clockwise to face outward)
        const bottomColor1 = useCheckerboard && i % 2 === 0 ? [1.0, 1.0, 1.0] : bottomColor;
        const bottomColor2 = useCheckerboard && i % 2 === 0 ? [1.0, 1.0, 1.0] : bottomColor;

        AddTriangle(
            0, -h, 0, ...bottomColor1, 0.5, 0.5, 0, -1, 0,
            x2, -h, z2, ...bottomColor2, u2, v2, 0, -1, 0,
            x1, -h, z1, ...bottomColor1, u1, v1, 0, -1, 0
        );
    }

    // Create the sides (quads)
    for (let i = 0; i < segments; i++) {
        const angle1 = (i / segments) * Math.PI * 2;
        const angle2 = ((i + 1) / segments) * Math.PI * 2;

        const x1 = Math.cos(angle1) * radius;
        const z1 = Math.sin(angle1) * radius;
        const x2 = Math.cos(angle2) * radius;
        const z2 = Math.sin(angle2) * radius;

        // Calculate normals for the sides
        const nx1 = Math.cos(angle1);
        const nz1 = Math.sin(angle1);
        const nx2 = Math.cos(angle2);
        const nz2 = Math.sin(angle2);

        // UV coordinates for texture mapping
        const u1 = i / segments;
        const u2 = (i + 1) / segments;

        // Side colors
        const sideColor = useCheckerboard && i % 2 === 0 ? sideColor1 : sideColor2;

        // Add quad for the side (counter-clockwise winding)
        AddQuad(
            x1, -h, z1, ...sideColor, u1, 1, nx1, 0, nz1,
            x2, -h, z2, ...sideColor, u2, 1, nx2, 0, nz2,
            x2, h, z2, ...sideColor, u2, 0, nx2, 0, nz2,
            x1, h, z1, ...sideColor, u1, 0, nx1, 0, nz1
        );
    }

    // Store original vertices for modifiers
    originalVertices = [...vertices];
}


// --- UI and Buffer Management ---

/**
 * MODIFIED: Creates dynamic UI elements (inputs + checkbox) and triggers geometry generation.
 */
function CreateGeometryUI() {
    // Get existing values or defaults
    const ew = document.getElementById('w'); const w = ew ? parseFloat(ew.value) : 1.0;
    const eh = document.getElementById('h'); const h = eh ? parseFloat(eh.value) : 1.0;
    const edx = document.getElementById('divx'); const divsX = edx ? parseInt(edx.value) : 1;
    const edy = document.getElementById('divy'); const divsY = edy ? parseInt(edy.value) : 1;
    const edz = document.getElementById('divz'); const divsZ = edz ? parseInt(edz.value) : 1;
    const esegs = document.getElementById('segments'); const segments = esegs ? parseInt(esegs.value) : 12;
    const erad = document.getElementById('radius'); const radius = erad ? parseFloat(erad.value) : 0.5;

    // Read checkbox state (default to true/checked if it doesn't exist yet)
    const checkerInput = document.getElementById('checkerToggle');
    const useCheckerboard = checkerInput ? checkerInput.checked : true; // Default to checkerboard ON

    // Get the selected shape
    let shapeDropdown = document.getElementById('shape');
    if (!shapeDropdown) { console.error("Shape dropdown not found!"); return; }
    const selectedShape = shapeDropdown.selectedIndex;

    // Generate HTML for the controls area
    const uiDiv = document.getElementById('ui');
    if (!uiDiv) { console.error("UI div not found!"); return; }

    // Different UI based on shape
    if (selectedShape === 3) { // Cylinder
        uiDiv.innerHTML = `
            <label for="radius">Radius:</label>
            <input type="number" id="radius" value="${radius}" min="0.1" step="0.1" onchange="InitShaders();">
            <br>
            <label for="h">Height:</label>
            <input type="number" id="h" value="${h}" min="0.1" step="0.1" onchange="InitShaders();">
            <br>
            <label for="segments">Segments:</label>
            <input type="number" id="segments" value="${segments}" min="3" step="1" onchange="InitShaders();">
            <br>
            <label for="checkerToggle">Checker:</label>
            <input type="checkbox" id="checkerToggle" ${useCheckerboard ? 'checked' : ''} onchange="InitShaders();">
            <span style="font-size: 0.8em;">(Toggle between checkerboard and gradient colors)</span>
        `;
    } else if (selectedShape === 2) { // Cube
        // Get texture toggle state
        const textureInput = document.getElementById('textureToggle');
        const useTexture = textureInput ? textureInput.checked : false;

        uiDiv.innerHTML = `
            <label for="w">Size:</label>
            <input type="number" id="w" value="${w}" min="0.1" step="0.1" onchange="InitShaders();">
            <hr>
            <label for="divx">Divs X:</label>
            <input type="number" id="divx" value="${divsX}" min="1" step="1" onchange="InitShaders();">
            <br>
            <label for="divy">Divs Y:</label>
            <input type="number" id="divy" value="${divsY}" min="1" step="1" onchange="InitShaders();">
            <br>
            <label for="divz">Divs Z:</label>
            <input type="number" id="divz" value="${divsZ}" min="1" step="1" onchange="InitShaders();">
            <br>
            <label for="checkerToggle">Checker:</label>
            <input type="checkbox" id="checkerToggle" ${useCheckerboard ? 'checked' : ''} onchange="InitShaders();">
            <span style="font-size: 0.8em;">(Toggle between checkerboard and flat colors)</span>
            <br>
            <label for="textureToggle">Use Texture:</label>
            <input type="checkbox" id="textureToggle" ${useTexture ? 'checked' : ''} onchange="InitShaders();">
            <span style="font-size: 0.8em;">(Use wooden box texture)</span>
        `;
    } else { // Triangle or Quad
        uiDiv.innerHTML = `
            <label for="w">Width:</label>
            <input type="number" id="w" value="${w}" min="0.1" step="0.1" onchange="InitShaders();">
            <br>
            <label for="h">Height:</label>
            <input type="number" id="h" value="${h}" min="0.1" step="0.1" onchange="InitShaders();">
        `;
    }

    // Generate geometry based on dropdown selection
    switch (selectedShape) {
        case 0: CreateTriangle(w, h); break;
        case 1: CreateQuad(w, h); break;
        case 2: CreateCube(w, divsX, divsY, divsZ, useCheckerboard); break;
        case 3: CreateCylinder(radius, h, segments, useCheckerboard); break;
        default: console.warn("Unknown shape selected"); CreateTriangle(w, h); break;
    }

    // Calculate vertices per vertex (position, color, uv, normal)
    const componentsPerVertex = 11; // x,y,z, r,g,b, u,v, nx,ny,nz
    console.log(`Generated ${vertices.length / componentsPerVertex} vertices.`);
}


// Additional uniform locations for lighting and textures
var uUseTextureGL = null;
var uTextureGL = null;
var uLightDirGL = null;
var uLightColorGL = null;
var uAmbientStrengthGL = null;

// Texture object
var woodTexture = null;

/**
 * Creates/updates the VBO, gets uniform locations, and triggers initial render.
 */
function CreateGeometryBuffers(program) {
    CreateGeometryUI(); // Fills 'vertices', updates UI
    CreateVBO(program, new Float32Array(vertices)); // Create/update VBO

    // Get uniform locations
    angleGL = gl.getUniformLocation(program, 'Angle');
    uProjectionMatrixGL = gl.getUniformLocation(program, 'uProjectionMatrix');
    uViewMatrixGL = gl.getUniformLocation(program, 'uViewMatrix');

    // Get lighting and texture uniform locations
    uUseTextureGL = gl.getUniformLocation(program, 'uUseTexture');
    uTextureGL = gl.getUniformLocation(program, 'uTexture');
    uLightDirGL = gl.getUniformLocation(program, 'uLightDir');
    uLightColorGL = gl.getUniformLocation(program, 'uLightColor');
    uAmbientStrengthGL = gl.getUniformLocation(program, 'uAmbientStrength');

    // Log warnings for missing uniforms
    if (angleGL === null) console.warn("Uniform 'Angle' not found.");
    if (uProjectionMatrixGL === null) console.warn("Uniform 'uProjectionMatrix' not found.");
    if (uViewMatrixGL === null) console.warn("Uniform 'uViewMatrix' not found.");
    if (uUseTextureGL === null) console.warn("Uniform 'uUseTexture' not found.");
    if (uTextureGL === null) console.warn("Uniform 'uTexture' not found.");
    if (uLightDirGL === null) console.warn("Uniform 'uLightDir' not found.");
    if (uLightColorGL === null) console.warn("Uniform 'uLightColor' not found.");
    if (uAmbientStrengthGL === null) console.warn("Uniform 'uAmbientStrength' not found.");

    // Set initial rotation angle (Matrices are set in Render)
    if (angleGL) gl.uniform4fv(angleGL, new Float32Array(angle));

    // Set lighting parameters
    if (uLightDirGL) {
        // Normalized light direction (pointing down and to the right)
        const lightDir = normalize([0.5, -1.0, 0.3]);
        gl.uniform3fv(uLightDirGL, new Float32Array(lightDir));
    }

    if (uLightColorGL) {
        // White light
        gl.uniform3fv(uLightColorGL, new Float32Array([1.0, 1.0, 1.0]));
    }

    if (uAmbientStrengthGL) {
        // Ambient light strength (0.2 = 20% ambient light)
        gl.uniform1f(uAmbientStrengthGL, 0.2);
    }

    // Get texture toggle state
    const textureInput = document.getElementById('textureToggle');
    const useTexture = textureInput ? textureInput.checked : false;

    // Get the selected shape
    let shapeDropdown = document.getElementById('shape');
    const selectedShape = shapeDropdown ? shapeDropdown.selectedIndex : 0;

    // If using texture and we have a texture loaded, bind it
    if (useTexture && woodTexture && uTextureGL && selectedShape === 2) { // Only apply texture to cube
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, woodTexture);
        gl.uniform1i(uTextureGL, 0); // Use texture unit 0
        gl.uniform1i(uUseTextureGL, 1); // Enable texturing
    } else {
        gl.uniform1i(uUseTextureGL, 0); // Disable texturing for other shapes
    }

    Render(); // Initial render
}

/**
 * Creates a VBO and configures vertex attributes (Pos, Color, TexCoord, Normal).
 */
function CreateVBO(program, vertexData) {
    if (!gl || vertexData.length === 0) {
        console.warn("No vertex data to create VBO");
        return;
    }

    // Create and bind the buffer
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.STATIC_DRAW);

    // Define the stride and offsets
    const floatSize = Float32Array.BYTES_PER_ELEMENT;
    const stride = 11 * floatSize; // x,y,z, r,g,b, u,v, nx,ny,nz

    // Position attribute (x, y, z)
    const posLoc = gl.getAttribLocation(program, 'Pos');
    if (posLoc >= 0) {
        gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, stride, 0);
        gl.enableVertexAttribArray(posLoc);
    } else {
        console.warn("Attribute 'Pos' not found");
    }

    // Color attribute (r, g, b)
    const colLoc = gl.getAttribLocation(program, 'Color');
    if (colLoc >= 0) {
        const offset = 3 * floatSize;
        gl.vertexAttribPointer(colLoc, 3, gl.FLOAT, false, stride, offset);
        gl.enableVertexAttribArray(colLoc);
    } else {
        console.warn("Attribute 'Color' not found");
    }

    // Texture coordinate attribute (u, v)
    const texCoordLoc = gl.getAttribLocation(program, 'TexCoord');
    if (texCoordLoc >= 0) {
        const offset = 6 * floatSize;
        gl.vertexAttribPointer(texCoordLoc, 2, gl.FLOAT, false, stride, offset);
        gl.enableVertexAttribArray(texCoordLoc);
    } else {
        console.warn("Attribute 'TexCoord' not found");
    }

    // Normal attribute (nx, ny, nz)
    const normalLoc = gl.getAttribLocation(program, 'Normal');
    if (normalLoc >= 0) {
        const offset = 8 * floatSize;
        gl.vertexAttribPointer(normalLoc, 3, gl.FLOAT, false, stride, offset);
        gl.enableVertexAttribArray(normalLoc);
    } else {
        console.warn("Attribute 'Normal' not found");
    }
}

//=============================================================================
// SECTION 6: TEXTURE MANAGEMENT
//=============================================================================

// Texture utility functions
const TextureUtils = {
    // Set standard texture parameters
    setTextureParams: (gl) => {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    },

    // Create a texture from raw data
    createTexture: (gl, width, height, data, format = gl.RGBA) => {
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);

        TextureUtils.setTextureParams(gl);

        gl.texImage2D(
            gl.TEXTURE_2D, 0, format, width, height, 0,
            format, gl.UNSIGNED_BYTE, data
        );

        gl.bindTexture(gl.TEXTURE_2D, null);
        return texture;
    }
};

// Load a texture from an image URL
function LoadTexture(gl, url, callback) {
    // Return cached texture if available
    if (textures[url]) {
        if (callback) callback(textures[url]);
        return textures[url];
    }

    const image = new Image();

    image.onload = function() {
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);

        TextureUtils.setTextureParams(gl);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

        textures[url] = texture;
        if (callback) callback(texture);
    };

    image.onerror = function() {
        console.error(`Failed to load texture: ${url}`);
        if (callback) callback(null);
    };

    image.src = url;
    return null;
}

const CreateTexture = TextureUtils.createTexture;

//=============================================================================
// SECTION 7: RENDERING AND MATRIX MATH
//=============================================================================

// Main rendering function
function Render() {
    if (!gl) return;
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Create projection matrix from current parameters
    const projectionMatrix = createPerspectiveMatrix(
        projectionParams.fov,
        projectionParams.aspect,
        projectionParams.near,
        projectionParams.far
    );

    // Set up camera view
    const cameraPosition = [0, 0, 3.5];
    const target = [0, 0, 0];
    const up = [0, 1, 0];
    const viewMatrix = createLookAtMatrix(cameraPosition, target, up);

    // Send matrices to shader
    if (uProjectionMatrixGL) {
        gl.uniformMatrix4fv(uProjectionMatrixGL, false, projectionMatrix);
    }
    if (uViewMatrixGL) {
        gl.uniformMatrix4fv(uViewMatrixGL, false, viewMatrix);
    }

    // Draw the geometry
    const componentsPerVertex = 11; // x,y,z, r,g,b, u,v, nx,ny,nz
    const vertexCount = vertices.length / componentsPerVertex;
    if (vertexCount > 0) {
        gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
    }
}

// Create a perspective projection matrix
function createPerspectiveMatrix(fov, aspect, near, far) {
    const f = 1.0 / Math.tan(fov / 2);
    const nf = 1 / (near - far);

    return [
        f / aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, (far + near) * nf, -1,
        0, 0, 2 * far * near * nf, 0
    ];
}

// Create a camera view matrix
function createLookAtMatrix(cameraPosition, target, up) {
    const zAxis = normalize(subtractVectors(cameraPosition, target));
    const xAxis = normalize(crossProduct(up, zAxis));
    const yAxis = normalize(crossProduct(zAxis, xAxis));

    return [
        xAxis[0], yAxis[0], zAxis[0], 0,
        xAxis[1], yAxis[1], zAxis[1], 0,
        xAxis[2], yAxis[2], zAxis[2], 0,
        -dotProduct(xAxis, cameraPosition), -dotProduct(yAxis, cameraPosition), -dotProduct(zAxis, cameraPosition), 1
    ];
}

// Vector math utilities
const Vec3 = {
    subtract: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],

    normalize: (v) => {
        const l = Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
        return l > 0.00001 ? [v[0]/l, v[1]/l, v[2]/l] : [0, 0, 0];
    },

    cross: (a, b) => [
        a[1]*b[2] - a[2]*b[1],
        a[2]*b[0] - a[0]*b[2],
        a[0]*b[1] - a[1]*b[0]
    ],

    dot: (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2]
};

// Compatibility aliases
const subtractVectors = Vec3.subtract;
const normalize = Vec3.normalize;
const crossProduct = Vec3.cross;
const dotProduct = Vec3.dot;

//=============================================================================
// SECTION 8: MODIFIERS AND UI UPDATES
//=============================================================================

// Update projection parameters from UI controls
function UpdateProjection() {
    const fovInput = document.getElementById('fov');
    const nearInput = document.getElementById('near');
    const farInput = document.getElementById('far');

    if (fovInput && nearInput && farInput) {
        // Update projection parameters
        projectionParams.fov = parseFloat(fovInput.value) * Math.PI / 180;
        projectionParams.near = parseFloat(nearInput.value);
        projectionParams.far = parseFloat(farInput.value);

        // Update UI display values
        document.getElementById('fov-value').textContent = fovInput.value + '°';
        document.getElementById('near-value').textContent = nearInput.value;
        document.getElementById('far-value').textContent = farInput.value;

        // Update aspect ratio from canvas
        if (gl) {
            projectionParams.aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
        }

        // Render with new projection
        Render();
    }
}
function UpdateModifiers() {
    // Helper function to update modifier controls
    function updateModifierControls(modType, valueType, valueSuffix = '') {
        const mainToggle = document.getElementById(`${modType}-toggle`);
        if (!mainToggle) return;

        modifiers[modType].enabled = mainToggle.checked;

        // Update axis controls (x, y, z)
        ['x', 'y', 'z'].forEach(axis => {
            const axisToggle = document.getElementById(`${modType}-${axis}-toggle`);
            const axisValue = document.getElementById(`${modType}-${axis}-${valueType}`);

            if (axisToggle && axisValue) {
                // Update UI state
                axisToggle.disabled = !modifiers[modType].enabled;
                axisValue.disabled = !modifiers[modType].enabled || !axisToggle.checked;

                // Update model values
                modifiers[modType][axis].enabled = axisToggle.checked;
                modifiers[modType][axis][valueType] = parseFloat(axisValue.value);

                // Update display value
                const valueDisplay = document.getElementById(`${modType}-${axis}-${valueType}-value`);
                if (valueDisplay) {
                    valueDisplay.textContent = axisValue.value + valueSuffix;
                }
            }
        });
    }

    // Update all modifier types
    updateModifierControls('bend', 'angle', '°');
    updateModifierControls('twist', 'angle', '°');
    updateModifierControls('taper', 'amount');
    updateModifierControls('bulge', 'amount');

    // Apply modifiers and render
    ApplyModifiers();
    Render();
}

/**
 * Applies all enabled modifiers to the vertices
 */
function ApplyModifiers() {
    // Make sure we have original vertices to work with
    if (originalVertices.length === 0) {
        return;
    }

    // Reset vertices to original state
    vertices = [...originalVertices];

    // Apply each modifier in sequence
    if (modifiers.bend.enabled) {
        ApplyBendModifier();
    }

    if (modifiers.twist.enabled) {
        ApplyTwistModifier();
    }

    if (modifiers.taper.enabled) {
        ApplyTaperModifier();
    }

    if (modifiers.bulge.enabled) {
        ApplyBulgeModifier();
    }

    // Update the VBO with modified vertices
    if (gl) {
        const program = gl.getParameter(gl.CURRENT_PROGRAM);
        if (program) {
            CreateVBO(program, new Float32Array(vertices));
        }
    }
}

/**
 * Applies the bend modifier to vertices
 */
function ApplyBendModifier() {

    // Apply bend for each axis if enabled
    if (modifiers.bend.x.enabled) {
        ApplyBendForAxis(0, modifiers.bend.x.angle);
    }

    if (modifiers.bend.y.enabled) {
        ApplyBendForAxis(1, modifiers.bend.y.angle);
    }

    if (modifiers.bend.z.enabled) {
        ApplyBendForAxis(2, modifiers.bend.z.angle);
    }
}

/**
 * Applies bend modifier for a specific axis
 * @param {number} bendAxis - The axis to bend around (0=X, 1=Y, 2=Z)
 * @param {number} bendAngle - The bend angle in degrees
 */
function ApplyBendForAxis(bendAxis, bendAngle) {
    const componentsPerVertex = 11; // x,y,z, r,g,b, u,v, nx,ny,nz
    const vertexCount = vertices.length / componentsPerVertex;
    const bendAngleRad = bendAngle * Math.PI / 180;

    // Skip if angle is zero
    if (Math.abs(bendAngleRad) < 0.001) {
        return;
    }

    // Determine affected axes based on bend axis
    let axis1, axis2;
    switch (bendAxis) {
        case 0: // X axis
            axis1 = 1; axis2 = 2; break; // Y and Z
        case 1: // Y axis
            axis1 = 0; axis2 = 2; break; // X and Z
        case 2: // Z axis
            axis1 = 0; axis2 = 1; break; // X and Y
        default:
            axis1 = 0; axis2 = 2; // Default to X and Z
    }

    // Find the range of the model along the bend axis
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < vertexCount; i++) {
        const offset = i * componentsPerVertex;
        const value = vertices[offset + bendAxis];
        min = Math.min(min, value);
        max = Math.max(max, value);
    }

    const range = max - min;
    if (range < 0.001) return; // Skip if model is flat along bend axis

    // Apply bend to each vertex
    for (let i = 0; i < vertexCount; i++) {
        const offset = i * componentsPerVertex;

        // Get vertex position
        const pos = [
            vertices[offset],
            vertices[offset + 1],
            vertices[offset + 2]
        ];

        // Calculate bend factor (0 to 1) based on position along bend axis
        const bendFactor = (pos[bendAxis] - min) / range;

        // Calculate bend angle for this vertex
        const vertexBendAngle = bendFactor * bendAngleRad;

        // Apply rotation around the bend axis
        const cos = Math.cos(vertexBendAngle);
        const sin = Math.sin(vertexBendAngle);

        // Store original values
        const orig1 = pos[axis1];
        const orig2 = pos[axis2];

        // Apply rotation
        pos[axis1] = orig1 * cos - orig2 * sin;
        pos[axis2] = orig1 * sin + orig2 * cos;

        // Update vertex position
        vertices[offset] = pos[0];
        vertices[offset + 1] = pos[1];
        vertices[offset + 2] = pos[2];

        // Update normal (simplified - just rotate the normal by the same angle)
        const normalOffset = offset + 8; // nx, ny, nz start at index 8
        const normal = [
            vertices[normalOffset],
            vertices[normalOffset + 1],
            vertices[normalOffset + 2]
        ];

        const origNormal1 = normal[axis1];
        const origNormal2 = normal[axis2];

        normal[axis1] = origNormal1 * cos - origNormal2 * sin;
        normal[axis2] = origNormal1 * sin + origNormal2 * cos;

        // Normalize the normal
        const length = Math.sqrt(normal[0]*normal[0] + normal[1]*normal[1] + normal[2]*normal[2]);
        if (length > 0.001) {
            normal[0] /= length;
            normal[1] /= length;
            normal[2] /= length;
        }

        // Update vertex normal
        vertices[normalOffset] = normal[0];
        vertices[normalOffset + 1] = normal[1];
        vertices[normalOffset + 2] = normal[2];
    }
}

/**
 * Applies the twist modifier to vertices
 */
function ApplyTwistModifier() {
    // Apply twist for each axis if enabled
    if (modifiers.twist.x.enabled) {
        ApplyTwistForAxis(0, modifiers.twist.x.angle);
    }

    if (modifiers.twist.y.enabled) {
        ApplyTwistForAxis(1, modifiers.twist.y.angle);
    }

    if (modifiers.twist.z.enabled) {
        ApplyTwistForAxis(2, modifiers.twist.z.angle);
    }
}

/**
 * Applies twist modifier for a specific axis
 * @param {number} twistAxis - The axis to twist around (0=X, 1=Y, 2=Z)
 * @param {number} twistAngle - The twist angle in degrees
 */
function ApplyTwistForAxis(twistAxis, twistAngle) {
    const componentsPerVertex = 11; // x,y,z, r,g,b, u,v, nx,ny,nz
    const vertexCount = vertices.length / componentsPerVertex;
    const twistAngleRad = twistAngle * Math.PI / 180;

    // Skip if angle is zero
    if (Math.abs(twistAngleRad) < 0.001) {
        return;
    }

    // Determine affected axes based on twist axis
    let axis1, axis2;
    switch (twistAxis) {
        case 0: // X axis
            axis1 = 1; axis2 = 2; break; // Y and Z
        case 1: // Y axis
            axis1 = 0; axis2 = 2; break; // X and Z
        case 2: // Z axis
            axis1 = 0; axis2 = 1; break; // X and Y
        default:
            axis1 = 0; axis2 = 2; // Default to X and Z
    }

    // Find the range of the model along the twist axis
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < vertexCount; i++) {
        const offset = i * componentsPerVertex;
        const value = vertices[offset + twistAxis];
        min = Math.min(min, value);
        max = Math.max(max, value);
    }

    const range = max - min;
    if (range < 0.001) return; // Skip if model is flat along twist axis

    // Apply twist to each vertex
    for (let i = 0; i < vertexCount; i++) {
        const offset = i * componentsPerVertex;

        // Get vertex position
        const pos = [
            vertices[offset],
            vertices[offset + 1],
            vertices[offset + 2]
        ];

        // Calculate twist factor (0 to 1) based on position along twist axis
        const twistFactor = (pos[twistAxis] - min) / range;

        // Calculate twist angle for this vertex
        const vertexTwistAngle = twistFactor * twistAngleRad;

        // Apply rotation around the twist axis
        const cos = Math.cos(vertexTwistAngle);
        const sin = Math.sin(vertexTwistAngle);

        // Store original values
        const orig1 = pos[axis1];
        const orig2 = pos[axis2];

        // Apply rotation
        pos[axis1] = orig1 * cos - orig2 * sin;
        pos[axis2] = orig1 * sin + orig2 * cos;

        // Update vertex position
        vertices[offset] = pos[0];
        vertices[offset + 1] = pos[1];
        vertices[offset + 2] = pos[2];

        // Update normal
        const normalOffset = offset + 8; // nx, ny, nz start at index 8
        const normal = [
            vertices[normalOffset],
            vertices[normalOffset + 1],
            vertices[normalOffset + 2]
        ];

        const origNormal1 = normal[axis1];
        const origNormal2 = normal[axis2];

        normal[axis1] = origNormal1 * cos - origNormal2 * sin;
        normal[axis2] = origNormal1 * sin + origNormal2 * cos;

        // Normalize the normal
        const length = Math.sqrt(normal[0]*normal[0] + normal[1]*normal[1] + normal[2]*normal[2]);
        if (length > 0.001) {
            normal[0] /= length;
            normal[1] /= length;
            normal[2] /= length;
        }

        // Update vertex normal
        vertices[normalOffset] = normal[0];
        vertices[normalOffset + 1] = normal[1];
        vertices[normalOffset + 2] = normal[2];
    }
}

/**
 * Applies the taper modifier to vertices
 */
function ApplyTaperModifier() {
    // Apply taper for each axis if enabled
    if (modifiers.taper.x.enabled) {
        ApplyTaperForAxis(0, modifiers.taper.x.amount);
    }

    if (modifiers.taper.y.enabled) {
        ApplyTaperForAxis(1, modifiers.taper.y.amount);
    }

    if (modifiers.taper.z.enabled) {
        ApplyTaperForAxis(2, modifiers.taper.z.amount);
    }
}

/**
 * Applies taper modifier for a specific axis
 * @param {number} taperAxis - The axis to taper along (0=X, 1=Y, 2=Z)
 * @param {number} taperAmount - The taper amount (-1 to 1)
 */
function ApplyTaperForAxis(taperAxis, taperAmount) {
    const componentsPerVertex = 11; // x,y,z, r,g,b, u,v, nx,ny,nz
    const vertexCount = vertices.length / componentsPerVertex;

    // Skip if amount is zero
    if (Math.abs(taperAmount) < 0.001) {
        return;
    }

    // Determine affected axes based on taper axis
    let axis1, axis2;
    switch (taperAxis) {
        case 0: // X axis
            axis1 = 1; axis2 = 2; break; // Y and Z
        case 1: // Y axis
            axis1 = 0; axis2 = 2; break; // X and Z
        case 2: // Z axis
            axis1 = 0; axis2 = 1; break; // X and Y
        default:
            axis1 = 0; axis2 = 2; // Default to X and Z
    }

    // Find the range of the model along the taper axis
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < vertexCount; i++) {
        const offset = i * componentsPerVertex;
        const value = vertices[offset + taperAxis];
        min = Math.min(min, value);
        max = Math.max(max, value);
    }

    const range = max - min;
    if (range < 0.001) return; // Skip if model is flat along taper axis

    // Find the center point along the taper axis
    const center = (min + max) / 2;

    // Apply taper to each vertex
    for (let i = 0; i < vertexCount; i++) {
        const offset = i * componentsPerVertex;

        // Get vertex position
        const pos = [
            vertices[offset],
            vertices[offset + 1],
            vertices[offset + 2]
        ];

        // Calculate distance from center along taper axis (ranges from -0.5 to 0.5)
        const distFromCenter = (pos[taperAxis] - center) / range;

        // Calculate scale factor based on distance from center
        // This creates an hourglass effect where the middle is pinched
        // 1.0 at the ends, 1.0 - taperAmount in the middle
        const scaleFactor = 1.0 - taperAmount * (1.0 - Math.abs(distFromCenter) * 2);

        // Apply scaling to the affected axes
        pos[axis1] *= scaleFactor;
        pos[axis2] *= scaleFactor;

        // Update vertex position
        vertices[offset] = pos[0];
        vertices[offset + 1] = pos[1];
        vertices[offset + 2] = pos[2];

        // Update normal
        const normalOffset = offset + 8; // nx, ny, nz start at index 8
        const normal = [
            vertices[normalOffset],
            vertices[normalOffset + 1],
            vertices[normalOffset + 2]
        ];

        // Adjust normal direction based on taper
        // For hourglass taper, normals need to point more outward/inward based on position
        if (distFromCenter > 0) {
            // Upper half - adjust normals based on taper direction
            normal[axis1] += normal[taperAxis] * taperAmount * (1.0 - distFromCenter * 2) * 0.5;
            normal[axis2] += normal[taperAxis] * taperAmount * (1.0 - distFromCenter * 2) * 0.5;
        } else {
            // Lower half - adjust normals in opposite direction
            normal[axis1] -= normal[taperAxis] * taperAmount * (1.0 + distFromCenter * 2) * 0.5;
            normal[axis2] -= normal[taperAxis] * taperAmount * (1.0 + distFromCenter * 2) * 0.5;
        }

        // Normalize the normal
        const length = Math.sqrt(normal[0]*normal[0] + normal[1]*normal[1] + normal[2]*normal[2]);
        if (length > 0.001) {
            normal[0] /= length;
            normal[1] /= length;
            normal[2] /= length;
        }

        // Update vertex normal
        vertices[normalOffset] = normal[0];
        vertices[normalOffset + 1] = normal[1];
        vertices[normalOffset + 2] = normal[2];
    }
}

/**
 * Applies the bulge modifier to vertices
 */
function ApplyBulgeModifier() {
    // Apply bulge for each axis if enabled
    if (modifiers.bulge.x.enabled) {
        ApplyBulgeForAxis(0, modifiers.bulge.x.amount);
    }

    if (modifiers.bulge.y.enabled) {
        ApplyBulgeForAxis(1, modifiers.bulge.y.amount);
    }

    if (modifiers.bulge.z.enabled) {
        ApplyBulgeForAxis(2, modifiers.bulge.z.amount);
    }
}

/**
 * Applies bulge modifier for a specific axis
 * @param {number} bulgeAxis - The axis to bulge along (0=X, 1=Y, 2=Z)
 * @param {number} bulgeAmount - The bulge amount (0 to 1)
 */
function ApplyBulgeForAxis(bulgeAxis, bulgeAmount) {
    const componentsPerVertex = 11; // x,y,z, r,g,b, u,v, nx,ny,nz
    const vertexCount = vertices.length / componentsPerVertex;

    // Skip if amount is zero
    if (Math.abs(bulgeAmount) < 0.001) {
        return;
    }

    // Find the bounding box
    let min = [Infinity, Infinity, Infinity];
    let max = [-Infinity, -Infinity, -Infinity];

    // Find the bounding box
    for (let i = 0; i < vertexCount; i++) {
        const offset = i * componentsPerVertex;
        for (let axis = 0; axis < 3; axis++) {
            min[axis] = Math.min(min[axis], vertices[offset + axis]);
            max[axis] = Math.max(max[axis], vertices[offset + axis]);
        }
    }

    // Calculate center
    const center = [
        (min[0] + max[0]) / 2,
        (min[1] + max[1]) / 2,
        (min[2] + max[2]) / 2
    ];

    // Calculate the size of the model along each axis
    const size = [
        (max[0] - min[0]) / 2,
        (max[1] - min[1]) / 2,
        (max[2] - min[2]) / 2
    ];

    // For axis-specific bulge, we'll use the size along the specified axis

    // Apply bulge to each vertex
    for (let i = 0; i < vertexCount; i++) {
        const offset = i * componentsPerVertex;

        // Get vertex position
        const pos = [
            vertices[offset],
            vertices[offset + 1],
            vertices[offset + 2]
        ];

        // Calculate distance from center along the bulge axis
        const axisDistance = Math.abs(pos[bulgeAxis] - center[bulgeAxis]);
        const normalizedAxisDist = axisDistance / size[bulgeAxis];

        // Calculate bulge factor - stronger in the center, weaker at the edges
        const bulgeFactor = Math.max(0, 1 - normalizedAxisDist * normalizedAxisDist) * bulgeAmount;

        // Calculate distance from center in all directions
        const distVec = [
            pos[0] - center[0],
            pos[1] - center[1],
            pos[2] - center[2]
        ];

        const dist = Math.sqrt(distVec[0]*distVec[0] + distVec[1]*distVec[1] + distVec[2]*distVec[2]);

        // Apply bulge in all directions (spherical)
        if (dist > 0.001) {
            for (let axis = 0; axis < 3; axis++) {
                // Move vertex outward from center
                pos[axis] += distVec[axis] / dist * bulgeFactor * size[bulgeAxis];
            }
        }

        // Update vertex position
        vertices[offset] = pos[0];
        vertices[offset + 1] = pos[1];
        vertices[offset + 2] = pos[2];

        // Update normal
        const normalOffset = offset + 8; // nx, ny, nz start at index 8
        const normal = [
            vertices[normalOffset],
            vertices[normalOffset + 1],
            vertices[normalOffset + 2]
        ];

        // For bulge, normals point more outward from center
        if (dist > 0.001) {
            for (let axis = 0; axis < 3; axis++) {
                normal[axis] += distVec[axis] / dist * bulgeFactor * 0.5;
            }
        }

        // Normalize the normal
        const length = Math.sqrt(normal[0]*normal[0] + normal[1]*normal[1] + normal[2]*normal[2]);
        if (length > 0.001) {
            normal[0] /= length;
            normal[1] /= length;
            normal[2] /= length;
        }

        // Update vertex normal
        vertices[normalOffset] = normal[0];
        vertices[normalOffset + 1] = normal[1];
        vertices[normalOffset + 2] = normal[2];
    }
}