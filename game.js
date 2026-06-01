// ==========================================
// --- Global Arrays & Configurations ---
// ==========================================
const gussArray = [], foods = [], trees = [], houses = [];
let scene; // Will be passed in from main.js

const SIM = {
    diskRadius: 100,
    speed: 0.15,
    maxTurnSpeed: 5,
    repelRadius: 4.0, // How close before they push away
    repelForce: 0.4
};

// ==========================================
// --- Entities ---
// ==========================================
class WorldObject {
    constructor(mesh, list, maxWorkers = 1) {
        this.mesh = mesh; this.dead = false; this.list = list;
        this.workers = 0; this.maxWorkers = maxWorkers;
        if(this.list) this.list.push(this);
        if(scene) scene.add(this.mesh);
    }
    destroy() { if(this.dead) return; this.dead = true; scene.remove(this.mesh); }
    update(delta) {}
}

class Food extends WorldObject {
    constructor(pos) {
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 16), new THREE.MeshStandardMaterial({ color: 0x55ff55 }));
        mesh.position.set(pos.x, 0.4, pos.z); super(mesh, foods, 1);
    }
}

class Tree extends WorldObject {
    constructor(pos) {
        const group = new THREE.Group(); group.position.set(pos.x, 0, pos.z);
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 3.5, 8), new THREE.MeshStandardMaterial({ color: 0x8b5a2b })); 
        trunk.position.y = 1.75;
        const leaves = new THREE.Mesh(new THREE.DodecahedronGeometry(2.2), new THREE.MeshStandardMaterial({ color: 0x228b22 })); 
        leaves.position.y = 4.0;
        group.add(trunk, leaves); 
        super(group, trees, 2);
        this.health = 100; this.falling = false; this.fallSpeed = 0;
    }
    update(delta) {
        // Fluid Falling Animation
        if (this.falling) {
            this.fallSpeed += delta * 2;
            this.mesh.rotation.x += this.fallSpeed * delta;
            if (this.mesh.rotation.x > Math.PI / 2) {
                this.destroy(); // Despawn once flat on the ground
            }
        }
    }
    chop(damage) { 
        if (this.falling) return false;
        this.health -= damage; 
        if (this.health <= 0) { 
            this.falling = true; // Trigger fluid fall
            return true; // Yields resources
        } 
        return false; 
    }
}

class Skyscraper extends WorldObject {
    constructor(pos) {
        const group = new THREE.Group(); group.position.set(pos.x, 0, pos.z);
        super(group, houses, 3);
        
        this.floors = 1; this.buildProgress = 0;
        this.baseMat = new THREE.MeshStandardMaterial({ color: 0xc19a6b, roughness: 1.0 });
        this.roofMat = new THREE.MeshStandardMaterial({ color: 0x4a4a4a });
        
        // Initial Floor
        this.addFloorMesh(0);
        
        // Roof
        this.roofMesh = new THREE.Mesh(new THREE.CylinderGeometry(0, 2.8, 2, 4), this.roofMat);
        this.roofMesh.rotation.y = Math.PI / 4;
        this.roofMesh.position.y = 3.5;
        this.mesh.add(this.roofMesh);
    }
    addFloorMesh(level) {
        let floor = new THREE.Mesh(new THREE.BoxGeometry(3, 2.5, 3), this.baseMat);
        floor.position.y = 1.25 + (level * 2.5);
        this.mesh.add(floor);
    }
    build(amount) {
        this.buildProgress += amount;
        if(this.buildProgress >= 100) {
            this.buildProgress = 0;
            this.floors++;
            this.addFloorMesh(this.floors - 1);
            // Move roof up dynamically!
            this.roofMesh.position.y = 3.5 + ((this.floors - 1) * 2.5);
        }
    }
}

// ==========================================
// --- Smarter, Fluid AI ---
// ==========================================
class Gus {
    constructor(pos) {
        this.group = new THREE.Group(); this.dead = false;
        this.group.position.set(pos.x, 0, pos.z);
        
        // Physics Vectors for smooth easing
        this.velocity = new THREE.Vector3(0,0,0);
        this.targetObj = null;

        const body = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 16).scale(0.7, 1.2, 0.7), new THREE.MeshStandardMaterial({ color: 0x44aaff }));
        body.position.y = 1.2;
        this.group.add(body);
        
        if(scene) scene.add(this.group);
    }

    findClosest(array) {
        let closest = null; let minDist = Infinity;
        for (let obj of array) {
            if (obj.dead || (obj.falling) || obj.workers >= obj.maxWorkers) continue;
            let d = this.group.position.distanceToSquared(obj.mesh.position);
            if (d < minDist) { minDist = d; closest = obj; }
        }
        return closest;
    }

    update(delta) {
        if (this.dead) return;

        // 1. Task Decision
        if (!this.targetObj || this.targetObj.dead || this.targetObj.falling) {
            if (this.targetObj) this.targetObj.workers--;
            
            // Randomly decide what to do
            let rand = Math.random();
            if (rand < 0.3) this.targetObj = this.findClosest(foods);
            else if (rand < 0.6) this.targetObj = this.findClosest(trees);
            else this.targetObj = this.findClosest(houses);

            if (this.targetObj) this.targetObj.workers++;
        }

        let desiredVelocity = new THREE.Vector3(0,0,0);

        // 2. Seek Target (or Wander if none)
        if (this.targetObj) {
            let dist = this.group.position.distanceTo(this.targetObj.mesh.position);
            if (dist > 2.5) {
                // Move towards target
                desiredVelocity.subVectors(this.targetObj.mesh.position, this.group.position).normalize().multiplyScalar(SIM.speed);
            } else {
                // Arrived: Do work
                if (trees.includes(this.targetObj)) {
                    if (this.targetObj.chop(30 * delta)) this.targetObj = null; // Cleared
                } else if (houses.includes(this.targetObj)) {
                    this.targetObj.build(30 * delta); // Build infinite floors
                } else if (foods.includes(this.targetObj)) {
                    this.targetObj.destroy(); this.targetObj = null;
                }
            }
        } else {
            // Idle wander (slow)
            desiredVelocity.set(Math.sin(Date.now()*0.001)*0.5, 0, Math.cos(Date.now()*0.001)*0.5).multiplyScalar(SIM.speed * 0.5);
        }

        // 3. Fluid Repulsion (Anti-clumping)
        let separation = new THREE.Vector3();
        let closeCount = 0;
        for(let other of gussArray) {
            if (other === this) continue;
            let dist = this.group.position.distanceTo(other.group.position);
            if (dist < SIM.repelRadius) {
                let pushForce = new THREE.Vector3().subVectors(this.group.position, other.group.position);
                // The closer they are, the harder they push away
                pushForce.normalize().divideScalar(Math.max(0.1, dist)).multiplyScalar(SIM.repelForce);
                separation.add(pushForce);
                closeCount++;
            }
        }
        if (closeCount > 0) {
            separation.divideScalar(closeCount);
            desiredVelocity.add(separation); // Blend seeking with repelling
        }

        // 4. Smooth Acceleration/Deceleration (Easing)
        // Lerp the actual velocity toward the desired velocity
        this.velocity.lerp(desiredVelocity, delta * 5);
        
        // 5. Apply Movement
        if (this.velocity.lengthSq() > 0.0001) {
            this.group.position.add(this.velocity);

            // Fluid Turning (Slerp)
            const targetRot = Math.atan2(this.velocity.x, this.velocity.z);
            const targetQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), targetRot);
            this.group.quaternion.slerp(targetQuaternion, delta * SIM.maxTurnSpeed);
        }

        // Disk boundaries
        if(this.group.position.lengthSq() > SIM.diskRadius * SIM.diskRadius) {
            this.group.position.multiplyScalar(0.98);
        }
    }
}
