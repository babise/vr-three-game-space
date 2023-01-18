import * as THREE from 'three';

import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { VRButton } from 'three/examples/jsm/webxr/VRButton'

import { Octree } from './libs/Octree.js';
import { OctreeHelper } from './libs/OctreeHelper.js';
import { Capsule } from './libs/Capsule.js';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/examples/jsm/webxr/XRHandModelFactory';

/**
 * CONSTANTS
 */

const GRAVITY = 30;

const NUM_CUBES = 100;
const CUBE_RADIUS = 0.2;

const STEPS_PER_FRAME = 5;

const cubeGeometry = new THREE.BoxGeometry(CUBE_RADIUS, CUBE_RADIUS, CUBE_RADIUS);

const cubes = [];
let cubeIdx = 0;

let cameraMoving = false;

const container = document.getElementById('container');

let controller1, controller2, hand1, hand2


/**
 * SETUP SCENE
 */

//

const clock = new THREE.Clock();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x432E61);
scene.fog = new THREE.Fog(0x432E61, 0, 100);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.rotation.order = 'YXZ';
camera.position.set(0, 2, 0)

// VR Camera
const dolly = new THREE.Object3D()
dolly.position.z = 5
dolly.add(camera)
scene.add(dolly)

const dummyCam = new THREE.Object3D()
camera.add(dummyCam)

/**
 * LIGHTS
 */
const hemiLight = new THREE.HemisphereLight(0x621e87, 0x621e87, 0.01);
hemiLight.color.setHSL(0.6, 1, 0.6);
hemiLight.groundColor.setHSL(0.095, 1, 0.75);
hemiLight.position.set(0, 500, 0);
scene.add(hemiLight);

//Add area light
const areaLight = new THREE.RectAreaLight(0xffffff, 1, 10, 10);
areaLight.position.set(0, 5, 0);


const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(- 5, 25, - 1);
directionalLight.castShadow = true;
directionalLight.shadow.camera.near = 0.01;
directionalLight.shadow.camera.far = 100;
directionalLight.shadow.camera.right = 30;
directionalLight.shadow.camera.left = - 30;
directionalLight.shadow.camera.top = 30;
directionalLight.shadow.camera.bottom = - 30;
directionalLight.shadow.mapSize.width = 1024;
directionalLight.shadow.mapSize.height = 1024;
directionalLight.shadow.radius = 4;
directionalLight.shadow.bias = - 0.00006;
scene.add(directionalLight);



/**
 * RENDERER
 */

const renderer = new THREE.WebGLRenderer({ antialias: true });

renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
container.appendChild(renderer.domElement);

renderer.xr.enabled = true
const button = VRButton.createButton(renderer)
container.appendChild(button)


for (let i = 0; i < NUM_CUBES; i++) {

    const cubeMaterial = new THREE.MeshLambertMaterial({ color: new THREE.Color(Math.random(), Math.random(), Math.random()) });
    const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
    cube.castShadow = true;
    cube.receiveShadow = true;

    scene.add(cube);

    cubes.push({
        mesh: cube,
        collider: new THREE.Sphere(new THREE.Vector3(0, - 100, 0), CUBE_RADIUS),
        velocity: new THREE.Vector3()
    });

}

const worldOctree = new Octree();

const playerCollider = new Capsule(new THREE.Vector3(0, 0.35, 0), new THREE.Vector3(0, 1, 0), 0.35);

const playerVelocity = new THREE.Vector3();
const playerDirection = new THREE.Vector3();

let playerOnFloor = false;
let mouseTime = 0;

const keyStates = {};

const vector1 = new THREE.Vector3();
const vector2 = new THREE.Vector3();
const vector3 = new THREE.Vector3();

document.addEventListener('keydown', (event) => {

    keyStates[event.code] = true;

});

document.addEventListener('keyup', (event) => {

    keyStates[event.code] = false;

});

container.addEventListener('mousedown', () => {
    document.body.requestPointerLock();
    mouseTime = performance.now();
});

document.addEventListener('mouseup', () => {

    if (document.pointerLockElement !== null) throwBall();

});

document.body.addEventListener('mousemove', (event) => {

    if (document.pointerLockElement === document.body) {

        camera.rotation.y -= event.movementX / 500
        camera.rotation.x -= event.movementY / 500

    }

});

window.addEventListener('resize', onWindowResize);

function onWindowResize() {

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);

}

function throwBall(controller) {

    const cube = cubes[cubeIdx]

    camera.getWorldDirection(playerDirection)
    const direction = controller ? controller.position : playerDirection
    if (controller) console.log(controller);


    const impulse = controller ? 35 : 15 + 30 * (1 - Math.exp((mouseTime - performance.now()) * 0.001))
    if (controller) {
        const vel = direction;
        vel.z -= 0.5
        cube.velocity.copy(vel).multiplyScalar(impulse)
        cube.collider.center.copy(dolly.position);
    }
    else {
        cube.velocity.copy(direction).multiplyScalar(impulse)
        cube.collider.center.copy(playerCollider.end).addScaledVector(direction, playerCollider.radius * 1.5)
        cube.velocity.addScaledVector(playerVelocity, 2)
    }

    cubeIdx = (cubeIdx + 1) % cubes.length

}

function playerCollisions() {

    const result = worldOctree.capsuleIntersect(playerCollider);

    playerOnFloor = false;

    if (result) {

        playerOnFloor = result.normal.y > 0;

        if (!playerOnFloor) {
            playerVelocity.addScaledVector(result.normal, - result.normal.dot(playerVelocity));
        }

        playerCollider.translate(result.normal.multiplyScalar(result.depth));

    }

}

function updatePlayer(deltaTime) {

    let damping = Math.exp(- 4 * deltaTime) - 1; // exponential decay with a time constant of 0.25 seconds (4 times per second) 

    if (!playerOnFloor) {

        playerVelocity.y -= GRAVITY * deltaTime;

        // small air resistance
        damping *= 0.1;

    }

    playerVelocity.addScaledVector(playerVelocity, damping);

    const deltaPosition = playerVelocity.clone().multiplyScalar(deltaTime);
    playerCollider.translate(deltaPosition);

    playerCollisions();

    dolly.position.copy(playerCollider.end)
}

function playerCubeCollision(cube) {

    const center = vector1.addVectors(playerCollider.start, playerCollider.end).multiplyScalar(0.5);

    const cube_center = cube.collider.center;

    const r = playerCollider.radius + cube.collider.radius;
    const r2 = r * r;


    for (const point of [playerCollider.start, playerCollider.end, center]) {

        const d2 = point.distanceToSquared(cube_center);

        if (d2 < r2) {

            const normal = vector1.subVectors(point, cube_center).normalize();
            const v1 = vector2.copy(normal).multiplyScalar(normal.dot(playerVelocity));
            const v2 = vector3.copy(normal).multiplyScalar(normal.dot(cube.velocity));

            playerVelocity.add(v2).sub(v1);
            cube.velocity.add(v1).sub(v2);

            const d = (r - Math.sqrt(d2)) / 2;
            cube_center.addScaledVector(normal, - d);

        }

    }

}

function cubesCollisions() {

    for (let i = 0, length = cubes.length; i < length; i++) {

        const s1 = cubes[i];

        for (let j = i + 1; j < length; j++) {

            const s2 = cubes[j];

            const d2 = s1.collider.center.distanceToSquared(s2.collider.center);
            const r = s1.collider.radius + s2.collider.radius;
            const r2 = r * r;

            if (d2 < r2) {

                const normal = vector1.subVectors(s1.collider.center, s2.collider.center).normalize();
                const v1 = vector2.copy(normal).multiplyScalar(normal.dot(s1.velocity));
                const v2 = vector3.copy(normal).multiplyScalar(normal.dot(s2.velocity));

                s1.velocity.add(v2).sub(v1);
                s2.velocity.add(v1).sub(v2);

                const d = (r - Math.sqrt(d2)) / 2;

                s1.collider.center.addScaledVector(normal, d);
                s2.collider.center.addScaledVector(normal, - d);

            }

        }

    }

}

function updateCubes(deltaTime) {

    cubes.forEach(cube => {

        cube.collider.center.addScaledVector(cube.velocity, deltaTime);

        const result = worldOctree.sphereIntersect(cube.collider);

        if (result) {

            cube.velocity.addScaledVector(result.normal, - result.normal.dot(cube.velocity) * 1.5);
            cube.collider.center.add(result.normal.multiplyScalar(result.depth));

        } else {
            cube.velocity.y -= GRAVITY * deltaTime;
        }
        const damping = Math.exp(- 1.5 * deltaTime) - 1;
        cube.velocity.addScaledVector(cube.velocity, damping);
        playerCubeCollision(cube);
    });

    cubesCollisions();

    for (const cube of cubes) {
        cube.mesh.position.copy(cube.collider.center);
    }

}

function getForwardVector() {

    camera.getWorldDirection(playerDirection);
    playerDirection.y = 0;
    playerDirection.normalize();

    return playerDirection;

}

function getSideVector() {
    camera.getWorldDirection(playerDirection);
    playerDirection.y = 0;
    playerDirection.normalize();
    playerDirection.cross(camera.up);

    return playerDirection;
}

function controls(deltaTime) {
    // gives a bit of air control
    const speedDelta = deltaTime * (playerOnFloor ? 25 : 8);

    if (keyStates['KeyW']) {
        playerVelocity.add(getForwardVector().multiplyScalar(speedDelta))
    }

    if (keyStates['KeyS']) {
        playerVelocity.add(getForwardVector().multiplyScalar(- speedDelta))
    }

    if (keyStates['KeyA']) {
        playerVelocity.add(getSideVector().multiplyScalar(- speedDelta))
    }

    if (keyStates['KeyD']) {
        playerVelocity.add(getSideVector().multiplyScalar(speedDelta));
    }

    if (playerOnFloor) {
        if (keyStates['Space']) {
            playerVelocity.y = 15;
        }
    }
}
const material = new THREE.MeshBasicMaterial({ color: '#2AF8FF' })
const loader = new GLTFLoader().setPath('./models/gltf/');

loader.load('map_colored_3.glb', (gltf) => {

    scene.add(gltf.scene);

    worldOctree.fromGraphNode(gltf.scene);


    gltf.scene.traverse(child => {

        if (child.isMesh) {

            child.castShadow = true;
            child.receiveShadow = true;

            if (child.material.map) {
                child.material.map.anisotropy = 4;
            }
        }
    });

    const helper = new OctreeHelper(worldOctree);
    helper.visible = false;
    scene.add(helper);

    animate();

});

function teleportPlayerIfOob() {
    if (camera.position.y <= - 25) {
        playerCollider.start.set(0, 0.35, 0);
        playerCollider.end.set(0, 1, 0);
        playerCollider.radius = 0.35;
        camera.position.copy(playerCollider.end);
        camera.rotation.set(0, 0, 0);
    }
}

function jump() {
    if (dolly.position.y < 5) {
        playerVelocity.y = 15;
    }
}

renderer.setAnimationLoop(animate)

setController()

function setController() {
    const controllerModelFactory = new XRControllerModelFactory();
    const handModelFactory = new XRHandModelFactory();

    controller1 = renderer.xr.getController(0);
    controller2 = renderer.xr.getController(1);
    dolly.add(controller1);
    scene.add(controller2);

    const controllerGrip1 = renderer.xr.getControllerGrip(0);
    controllerGrip1.add(controllerModelFactory.createControllerModel(controllerGrip1));
    const controllerGrip2 = renderer.xr.getControllerGrip(1);
    scene.add(controllerGrip1, controllerGrip2);

    controller2.addEventListener('selectstart', () => {
        cameraMoving = true
    })
    controller2.addEventListener('squeeze', () => {
        jump()
    })
    controller2.addEventListener('selectend', () => {
        cameraMoving = false
    })

    controller1.addEventListener('selectstart', () => {
        throwBall(controller1)
    })

    hand1 = renderer.xr.getHand(0);
    hand1.add(handModelFactory.createHandModel(hand1));

    hand2 = renderer.xr.getHand(1);
    hand2.add(handModelFactory.createHandModel(hand2));

    scene.add(hand1, hand2);
}

function moveCamera(deltaTime) {
    const speedDelta = deltaTime * 180;
    playerVelocity.add(getForwardVector().multiplyScalar(speedDelta))
}

function animate() {

    const deltaTime = Math.min(0.05, clock.getDelta()) / STEPS_PER_FRAME

    scene.updateMatrixWorld()
    scene.updateWorldMatrix()

    for (let i = 0; i < STEPS_PER_FRAME; i++) {
        controls(deltaTime)
        updatePlayer(deltaTime)
        updateCubes(deltaTime)
        teleportPlayerIfOob()
    }

    if (cameraMoving) {
        moveCamera(deltaTime)
    }

    renderer.render(scene, camera)
}