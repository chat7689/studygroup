const SIM = { diskRadius: 100, speed: 0.2, maxTurnSpeed: 8, repelRadius: 4.5, repelForce: 0.5, energyDrain: 0.05 };
const gussArray = [], foods = [], trees = [], houses = [], animals = [], farms = [], meteors = [];
let scene;

// Neural Weights (Controlled by Human Sliders)
const AI_WEIGHTS = { gather: 1.0, build: 1.0, hunt: 1.0, farm: 1.0 };

const mats = {
    wood: null, leaves: null, food: null, meat: null, houseWood: null, roof: null,
    animal: null, farmDirt: null, crop: null, gusBody: null, meteor: null
};

// --- God Power Entities ---
class Meteor {
    constructor(targetPos) {
        if(!mats.meteor) mats.meteor = new THREE.MeshStandardMaterial({ color: 0xff4422, emissive: 0xff2200, roughness: 0.2 });
        this.mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(2, 1), mats.meteor);
        // Start high up in the sky, exactly over the click
        this.mesh.position.set(targetPos.x, 100, targetPos.z);
        this.targetPos = targetPos;
        this.dead = false; this.speed = 100; // Falls very fast
        scene.add(this.mesh); meteors.push(this);
    }
    update(delta) {
        if(this.dead) return;
        this.mesh.position.y -= this.speed * delta;
        this.mesh.rotation.x += 10 * delta;
        
        if (this.mesh.position.y <= 0) {
            this.mesh.position.y = 0; this.explode();
        }
    }
    explode() {
        this.dead = true; scene.remove(this.mesh);
        // Annihilate everything in a 15 unit radius
        const wipeList = [gussArray, trees, foods, animals, houses, farms];
        wipeList.forEach(list => {
            list.forEach(obj => {
                if(!obj.dead && obj.mesh.position.distanceTo(this.targetPos) < 15) obj.destroy();
            });
        });
        // Create an explosion flash
        let flash = new THREE.PointLight(0xff4400, 5, 50);
        flash.position.copy(this.targetPos); flash.position.y = 2;
        scene.add(flash);
        setTimeout(() => scene.remove(flash), 300);
    }
}

// --- Standard Entities ---
class WorldObject {
    constructor(mesh, list, maxWorkers = 1) {
        this.mesh = mesh; this.dead = false; this.list = list; this.workers = 0; this.maxWorkers = maxWorkers;
        if(this.list) this.list.push(this); if(scene) scene.add(this.mesh);
    }
    destroy() { if(this.dead) return; this.dead = true; scene.remove(this.mesh); }
    update(delta) {}
}

class Food extends WorldObject {
    constructor(pos, isMeat = false) {
        if(!mats.food) { mats.food = new THREE.MeshStandardMaterial({ color: 0x55ff55 }); mats.meat = new THREE.MeshStandardMaterial({ color: 0xff5555 }); }
        super(new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 16), isMeat ? mats.meat : mats.food), foods, 1);
        this.mesh.position.set(pos.x, 0.4, pos.z); this.isMeat = isMeat;
    }
}

class Tree extends WorldObject {
    constructor(pos) {
        if(!mats.wood) { mats.wood = new THREE.MeshStandardMaterial({ color: 0x8b5a2b }); mats.leaves = new THREE.MeshStandardMaterial({ color: 0x228b22 }); }
        const group = new THREE.Group(); group.position.set(pos.x, 0, pos.z);
        const t = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 3.5, 8), mats.wood); t.position.y = 1.75;
        const l = new THREE.Mesh(new THREE.DodecahedronGeometry(2.2), mats.leaves); l.position.y = 4.0;
        group.add(t, l); super(group, trees, 2); this.health = 100;
    }
    chop(damage) { this.health -= damage; if(this.health <= 0) { this.destroy(); return true; } return false; }
}

class Skyscraper extends WorldObject {
    constructor(pos) {
        if(!mats.houseWood) { mats.houseWood = new THREE.MeshStandardMaterial({ color: 0xc19a6b }); mats.roof = new THREE.MeshStandardMaterial({ color: 0x4a4a4a }); }
        const group = new THREE.Group(); group.position.set(pos.x, 0, pos.z); super(group, houses, 3);
        this.floors = 1; this.buildProgress = 0; this.addFloorMesh(0);
        this.roofMesh = new THREE.Mesh(new THREE.CylinderGeometry(0, 2.8, 2, 4), mats.roof);
        this.roofMesh.rotation.y = Math.PI / 4; this.roofMesh.position.y = 3.5; this.mesh.add(this.roofMesh);
    }
    addFloorMesh(l) { let f = new THREE.Mesh(new THREE.BoxGeometry(3, 2.5, 3), mats.houseWood); f.position.y = 1.25 + (l * 2.5); this.mesh.add(f); }
    build(amt) {
        this.buildProgress += amt;
        if(this.buildProgress >= 100) { this.buildProgress = 0; this.floors++; this.addFloorMesh(this.floors - 1); this.roofMesh.position.y = 3.5 + ((this.floors - 1) * 2.5); }
    }
}

class Farm extends WorldObject {
    constructor(pos) {
        if(!mats.farmDirt) { mats.farmDirt = new THREE.MeshStandardMaterial({ color: 0x3d2817 }); mats.crop = new THREE.MeshStandardMaterial({ color: 0xffdd44 }); }
        const group = new THREE.Group(); group.position.set(pos.x, 0, pos.z);
        let dirt = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.2, 3.5), mats.farmDirt); dirt.position.y=0.1; group.add(dirt);
        super(group, farms, 1); this.crops = []; this.growth = 0; this.isReady = false;
        [[-1,-1],[1,-1],[-1,1],[1,1],[0,0]].forEach(p=>{
            let c = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.0, 4), mats.crop);
            c.position.set(p[0],0.5,p[1]); c.scale.setScalar(0.01); group.add(c); this.crops.push(c);
        });
    }
    update(delta) {
        if(this.growth < 100) {
            this.growth += delta * 15 * (window.currentWeather === 'RAIN' ? 2 : 1);
            let s = Math.max(0.01, this.growth/100); this.crops.forEach(c=>c.scale.set(s, s*1.5, s));
            if(this.growth >= 100) { this.growth = 100; this.isReady = true; }
        }
    }
    harvest() { if(this.isReady) { this.growth = 0; this.isReady = false; this.crops.forEach(c=>c.scale.setScalar(0.01)); return true; } return false; }
}

class Animal extends WorldObject {
    constructor(pos) {
        if(!mats.animal) mats.animal = new THREE.MeshStandardMaterial({ color: 0xffb6c1 });
        super(new THREE.Mesh(new THREE.SphereGeometry(0.8, 16, 16), mats.animal), animals, 1);
        this.mesh.position.set(pos.x, 0.8, pos.z); this.health = 50; this.theta = Math.random() * Math.PI * 2;
    }
    update(delta) {
        if(Math.random()<0.02) this.theta += (Math.random()-0.5);
        this.mesh.position.x += Math.sin(this.theta)*delta*1.5; this.mesh.position.z += Math.cos(this.theta)*delta*1.5;
        if(this.mesh.position.lengthSq() > 9000) this.theta += Math.PI;
    }
    takeDamage(dmg) {
        this.health -= dmg;
        if(this.health <= 0) {
            for(let i=0; i<3; i++) new Food({x: this.mesh.position.x+(Math.random()-0.5)*2, z: this.mesh.position.z+(Math.random()-0.5)*2}, true);
            this.destroy(); return true;
        } return false;
    }
}

// --- The Neural AI Gus ---
class Gus {
    constructor(pos, energy = 80) {
        this.group = new THREE.Group(); this.dead = false; this.energy = energy;
        this.group.position.set(pos.x, 0, pos.z); this.velocity = new THREE.Vector3(0,0,0);
        this.targetObj = null; this.action = 'wander'; this.wood = 0; this.isBeingDragged = false;
        
        if(!mats.gusBody) mats.gusBody = new THREE.MeshStandardMaterial({ color: 0x44aaff });
        const body = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 16).scale(0.7, 1.2, 0.7), mats.gusBody);
        body.position.y = 1.2; this.group.add(body);
        
        // This makes the group raycastable in main.js
        this.group.userData = { isGus: true, instance: this };
        body.userData = { isGus: true, instance: this }; 

        if(scene) scene.add(this.group);
    }

    clearTarget() { if(this.targetObj && !this.targetObj.dead) this.targetObj.workers = Math.max(0, this.targetObj.workers - 1); this.targetObj = null; this.action = 'wander'; }

    // Neural Decision Matrix: Scores objects based on distance AND human-controlled weights
    findBestTargetByNeuralMatrix() {
        let bestTarget = null; let bestScore = -Infinity; let chosenAction = 'wander';

        const evaluate = (list, baseWeight, actionStr, reqReady = false) => {
            for (let obj of list) {
                if (obj.dead || obj.workers >= obj.maxWorkers) continue;
                if (reqReady && obj.isReady === false) continue;
                
                let dist = this.group.position.distanceTo(obj.mesh.position);
                if(dist === 0) dist = 0.1;

                // Neural Formula: (Base Multiplier * Global Human Weight) / Distance
                let score = (100 * baseWeight) / dist; 
                
                if (score > bestScore) { bestScore = score; bestTarget = obj; chosenAction = actionStr; }
            }
        };

        // If starving, survival overrides everything
        if (this.energy < 30) {
            evaluate(foods, 10.0, 'eat'); 
            return { target: bestTarget, action: chosenAction };
        }

        // Apply Human Synaptic Weights
        evaluate(foods, AI_WEIGHTS.gather * 0.5, 'eat');
        evaluate(trees, AI_WEIGHTS.gather, 'chop');
        evaluate(animals, AI_WEIGHTS.hunt, 'hunt');
        evaluate(farms, AI_WEIGHTS.farm, 'harvest', true);
        
        // Conditional weights (need wood to build)
        if (this.wood >= 2) evaluate(farms, AI_WEIGHTS.farm * 1.5, 'build_farm'); // Phantom target to build farm
        if (this.wood >= 3) evaluate(houses, AI_WEIGHTS.build, 'build_house');

        // Override if they want to build but no houses exist nearby
        if(this.wood >= 3 && AI_WEIGHTS.build > 0 && houses.length < 15 && Math.random() < (AI_WEIGHTS.build * 0.1)) {
            return { target: null, action: 'spawn_house' };
        }
        if(this.wood >= 2 && AI_WEIGHTS.farm > 0 && farms.length < 5 && Math.random() < (AI_WEIGHTS.farm * 0.1)) {
            return { target: null, action: 'build_farm' };
        }

        return { target: bestTarget, action: chosenAction };
    }

    update(delta) {
        if (this.dead || this.isBeingDragged) return; // Physics pause if dragged by human!
        
        this.energy -= SIM.energyDrain * delta * 60;
        if(this.energy <= 0) { this.dead = true; scene.remove(this.group); return; }

        if (!this.targetObj || this.targetObj.dead) {
            this.clearTarget();
            let decision = this.findBestTargetByNeuralMatrix();
            this.targetObj = decision.target;
            this.action = decision.action;
            if (this.targetObj) this.targetObj.workers++;
        }

        let desiredVelocity = new THREE.Vector3(0,0,0);

        if (this.action === 'spawn_house') {
            this.wood -= 3; new Skyscraper(this.group.position); this.clearTarget();
        } else if (this.action === 'build_farm') {
            this.wood -= 2; new Farm(this.group.position); this.clearTarget();
        } else if (this.targetObj) {
            let dist = this.group.position.distanceTo(this.targetObj.mesh.position);
            if (dist > 2.5) {
                desiredVelocity.subVectors(this.targetObj.mesh.position, this.group.position).normalize().multiplyScalar(SIM.speed * (window.currentWeather==='RAIN'?0.7:1));
            } else {
                if (this.action === 'chop' && this.targetObj.chop(30 * delta)) { this.wood += 2; this.clearTarget(); }
                else if (this.action === 'build_house') { this.targetObj.build(30 * delta); if(this.wood-- <= 0) this.clearTarget(); }
                else if (this.action === 'eat') { this.energy += (this.targetObj.isMeat ? 100 : 40); this.targetObj.destroy(); this.clearTarget(); }
                else if (this.action === 'harvest') { if(this.targetObj.harvest()) this.clearTarget(); }
                else if (this.action === 'hunt') { if(this.targetObj.takeDamage(40 * delta)) this.clearTarget(); }
            }
        } else {
            desiredVelocity.set(Math.sin(Date.now()*0.001 + this.group.id), 0, Math.cos(Date.now()*0.001 + this.group.id)).multiplyScalar(SIM.speed * 0.4);
        }

        // Repulsion
        let separation = new THREE.Vector3(); let closeCount = 0;
        for(let other of gussArray) {
            if (other === this || other.dead || other.isBeingDragged) continue;
            let dist = this.group.position.distanceTo(other.group.position);
            if (dist < SIM.repelRadius) {
                let push = new THREE.Vector3().subVectors(this.group.position, other.group.position).normalize().divideScalar(Math.max(0.1, dist)).multiplyScalar(SIM.repelForce);
                separation.add(push); closeCount++;
            }
        }
        if (closeCount > 0) desiredVelocity.add(separation.divideScalar(closeCount));

        // Move
        this.velocity.lerp(desiredVelocity, delta * 5);
        if (this.velocity.lengthSq() > 0.0001) {
            this.group.position.add(this.velocity);
            this.group.quaternion.slerp(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), Math.atan2(this.velocity.x, this.velocity.z)), delta * SIM.maxTurnSpeed);
        }

        // Pop Cap & Bounds
        if(this.group.position.lengthSq() > SIM.diskRadius * SIM.diskRadius) this.group.position.multiplyScalar(0.98);
        if (this.energy > 160 && gussArray.length < 80) { this.energy -= 80; gussArray.push(new Gus({x: this.group.position.x+2, z: this.group.position.z+2}, 60)); }
    }
}
