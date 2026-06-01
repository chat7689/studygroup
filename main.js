let camera, renderer, clock, dirLight, hemiLight, rainParticles, controls;
let activeGodPower = 'drag'; // 'drag', 'meteor', 'thunder'
let draggedGus = null;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let groundPlane; // Invisible plane for raycast dragging
window.currentWeather = 'CLEAR';

// Setup UI Interaction
['gather','build','hunt','farm'].forEach(v => document.getElementById(`ai-${v}`).addEventListener('input', e => {
    AI_WEIGHTS[v] = parseFloat(e.target.value);
    document.getElementById(`ai-${v}-val`).innerText = AI_WEIGHTS[v].toFixed(1);
}));

document.getElementById('btn-rain').addEventListener('click', () => {
    window.currentWeather = window.currentWeather === 'CLEAR' ? 'RAIN' : 'CLEAR';
    document.getElementById('weather-status').innerText = window.currentWeather;
});

const powerBtns = ['drag', 'meteor', 'thunder'];
powerBtns.forEach(id => {
    document.getElementById(`btn-${id}`).addEventListener('click', () => {
        activeGodPower = id;
        powerBtns.forEach(b => document.getElementById(`btn-${b}`).classList.remove('active'));
        document.getElementById(`btn-${id}`).classList.add('active');
        
        let hint = id === 'drag' ? "Active: Click a Gus to drag them!" : 
                   (id === 'meteor' ? "Active: Click ground to destroy!" : "Active: Click ground to strike lightning!");
        document.getElementById('power-hint').innerText = hint;
    });
});

function init() {
    const container = document.getElementById('canvas-container');
    scene = new THREE.Scene(); scene.background = new THREE.Color(0x87CEEB); 

    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 95, 140);

    renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); 
    container.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.05;

    hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.9); hemiLight.position.set(0, 50, 0); scene.add(hemiLight);
    dirLight = new THREE.DirectionalLight(0xffffff, 1.1); dirLight.position.set(40, 80, -40); scene.add(dirLight);

    const diskMesh = new THREE.Mesh(new THREE.CylinderGeometry(100, 100, 2, 64), new THREE.MeshStandardMaterial({ color: 0x557733 }));
    diskMesh.position.y = -1; scene.add(diskMesh);
    
    // Invisible plane for precise mouse dragging mapping
    groundPlane = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), new THREE.MeshBasicMaterial({visible: false}));
    groundPlane.rotation.x = -Math.PI / 2; scene.add(groundPlane);

    // Weather Particles
    const rainGeo = new THREE.BufferGeometry(); const rainPos = new Float32Array(3000 * 3);
    for(let i=0; i<3000; i++) { rainPos[i*3] = (Math.random()-0.5)*200; rainPos[i*3+1] = Math.random()*100; rainPos[i*3+2] = (Math.random()-0.5)*200; }
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
    rainParticles = new THREE.Points(rainGeo, new THREE.PointsMaterial({ color: 0xaaaaee, size: 0.5, transparent: true, opacity: 0.6 }));
    rainParticles.visible = false; scene.add(rainParticles);

    clock = new THREE.Clock();

    // Spawn Initial World
    for(let i=0; i<30; i++) gussArray.push(new Gus(getRandomPos()));
    for(let i=0; i<60; i++) new Food(getRandomPos());
    for(let i=0; i<30; i++) new Tree(getRandomPos());
    for(let i=0; i<8; i++) new Animal(getRandomPos());

    // God Mode Mouse Interaction Events
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });
    
    animate();
}

// --- God Mode Interactivity ---
function getIntersects(e, objects) {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1; mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    return raycaster.intersectObjects(objects, true); // true checks children
}

function onPointerDown(e) {
    if (activeGodPower === 'drag') {
        const intersects = getIntersects(e, scene.children);
        for(let hit of intersects) {
            if (hit.object.userData.isGus) {
                controls.enabled = false; // Stop camera spinning
                draggedGus = hit.object.userData.instance;
                draggedGus.isBeingDragged = true; // Pause AI physics
                draggedGus.velocity.set(0,0,0);
                break;
            }
        }
    } else {
        // Drop Meteor or Thunder on ground plane
        const intersects = getIntersects(e, [groundPlane]);
        if (intersects.length > 0) {
            if(activeGodPower === 'meteor') new Meteor(intersects[0].point);
            if(activeGodPower === 'thunder') triggerLightning(intersects[0].point);
        }
    }
}

function onPointerMove(e) {
    if (draggedGus) {
        const intersects = getIntersects(e, [groundPlane]);
        if (intersects.length > 0) {
            // Hover the Gus slightly above ground while dragging
            draggedGus.group.position.set(intersects[0].point.x, 2, intersects[0].point.z);
        }
    }
}

function onPointerUp(e) {
    if (draggedGus) {
        draggedGus.group.position.y = 0; // Snap back to ground
        draggedGus.isBeingDragged = false;
        draggedGus = null;
        controls.enabled = true; // Re-enable camera
    }
}

function triggerLightning(pos) {
    // Kills 1 random Gus or Animal nearby
    let flash = new THREE.PointLight(0xffffaa, 10, 100);
    flash.position.set(pos.x, 10, pos.z); scene.add(flash);
    scene.background = new THREE.Color(0xffffff); // Screen flash
    
    [gussArray, animals].forEach(list => {
        for(let obj of list) {
            if(!obj.dead && obj.mesh && obj.mesh.position && obj.mesh.position.distanceTo(pos) < 10) {
                obj.destroy(); break; // Kill max 1 thing
            }
        }
    });

    setTimeout(() => { scene.remove(flash); }, 150);
}

function getRandomPos() {
    const a = Math.random() * Math.PI * 2; const r = Math.random() * 95; 
    return { x: Math.sin(a) * r, y: 0, z: Math.cos(a) * r };
}

function animate() { 
    requestAnimationFrame(animate); 
    const delta = Math.min(clock.getDelta(), 0.1);

    if (window.currentWeather !== 'RAIN' && scene.background.getHex() !== 0xffffff) {
        scene.background.lerp(new THREE.Color(0x87CEEB), 0.1); // Recover from lightning flash
    } else if (window.currentWeather === 'RAIN') {
        scene.background.lerp(new THREE.Color(0x556677), 0.1);
        const pos = rainParticles.geometry.attributes.position.array;
        for(let i=1; i<pos.length; i+=3) { pos[i] -= delta * 40; if(pos[i] < 0) pos[i] = 100; }
        rainParticles.geometry.attributes.position.needsUpdate = true;
    }
    rainParticles.visible = window.currentWeather === 'RAIN';

    const cleanup = arr => { for(let i=arr.length-1; i>=0; i--) if(arr[i].dead) arr.splice(i, 1); };
    [trees, houses, farms, animals, gussArray, meteors].forEach(list => list.forEach(i => i.update(delta)));
    [gussArray, foods, trees, animals, houses, farms, meteors].forEach(cleanup);

    if(Math.random() < 0.05 * delta && foods.length < 100) new Food(getRandomPos());
    if(Math.random() < 0.01 * delta && trees.length < 40) new Tree(getRandomPos());

    document.getElementById('stat-guss').innerText = gussArray.length;
    document.getElementById('stat-animals').innerText = animals.length;

    controls.update();
    renderer.render(scene, camera); 
}

window.onload = init;
