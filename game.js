// ==========================================
// --- Global Configurations & Arrays ---
// ==========================================
const SIM = {
    diskRadius: 100,
    speed: 0.2, maxTurnSpeed: 8,
    repelRadius: 4.5, repelForce: 0.5,
    energyDrain: 0.05, foodEnergy: 40, meatEnergy: 100,
    farmGrowSpeed: 15
};

const gussArray = [], foods = [], trees = [], houses = [], animals = [], farms = [];
let scene, pTrees = 1.0, pFood = 1.0, pHouse = 1.0, pBreed = 1.0;

// Shared Materials
const mats = {
    wood: null, leaves: null, food: null, houseWood: null, roof: null,
    animal: null, farmDirt: null, crop: null, gusMiner: null, gusFarmer: null
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
    constructor(pos, isMeat = false) {
        if(!mats.food) mats.food = new THREE.MeshStandardMaterial({ color: 0x55ff55 });
        if(!mats.meat) mats.meat = new THREE.MeshStandardMaterial({ color: 0xff5555 });
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 16), isMeat ? mats.meat : mats.food);
        mesh.position.set(pos.x, 0.4, pos.z); 
        super(mesh, foods, 1);
        this.isMeat = isMeat;
    }
}

class Tree extends WorldObject {
    constructor(pos) {
        if(!mats.wood) {
            mats.wood = new THREE.MeshStandardMaterial({ color: 0x8b5a2b });
            mats.leaves = new THREE.MeshStandardMaterial({ color: 0x228b22 });
        }
        const group = new THREE.Group(); group.position.set(pos.x, 0, pos.z);
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 3.5, 8), mats.wood); trunk.position.y = 1.75;
        const leaves = new THREE.Mesh(new THREE.DodecahedronGeometry(2.2), mats.leaves); leaves.position.y = 4.0;
        group.add(trunk, leaves); 
        super(group, trees, 2);
        this.health = 100; this.falling = false; this.fallSpeed = 0;
        this.mesh.scale.setScalar(0.01); this.sprouting = true; this.sproutTimer = 0;
    }
    update(delta) {
        if (this.sprouting) {
            this.sproutTimer += delta;
            let s = Math.min(this.sproutTimer / 1.5, 1);
            this.mesh.scale.setScalar(s);
            if (s === 1) this.sprouting = false;
        }
        if (this.falling) {
            this.fallSpeed += delta * 2;
            this.mesh.rotation.x += this.fallSpeed * delta;
            if (this.mesh.rotation.x > Math.PI / 2) this.destroy();
        }
    }
    chop(damage) { 
        if (this.falling || this.sprouting) return false;
        this.health -= damage; 
        if (this.health <= 0) { this.falling = true; return true; } 
        return false; 
    }
}

class Skyscraper extends WorldObject {
    constructor(pos) {
        if(!mats.houseWood) {
            mats.houseWood = new THREE.MeshStandardMaterial({ color: 0xc19a6b, roughness: 1.0 });
            mats.roof = new THREE.MeshStandardMaterial({ color: 0x4a4a4a });
        }
        const group = new THREE.Group(); group.position.set(pos.x, 0, pos.z);
        super(group, houses, 3);
        this.floors = 1; this.buildProgress = 0;
        this.addFloorMesh(0);
        this.roofMesh = new THREE.Mesh(new THREE.CylinderGeometry(0, 2.8, 2, 4), mats.roof);
        this.roofMesh.rotation.y = Math.PI / 4; this.roofMesh.position.y = 3.5;
        this.mesh.add(this.roofMesh);
    }
    addFloorMesh(level) {
        let floor = new THREE.Mesh(new THREE.BoxGeometry(3, 2.5, 3), mats.houseWood);
        floor.position.y = 1.25 + (level * 2.5); this.mesh.add(floor);
    }
    build(amount) {
        this.buildProgress += amount;
        if(this.buildProgress >= 100) {
            this.buildProgress = 0; this.floors++;
            this.addFloorMesh(this.floors - 1);
            this.roofMesh.position.y = 3.5 + ((this.floors - 1) * 2.5);
        }
    }
}

class Farm extends WorldObject {
    constructor(pos) {
        if(!mats.farmDirt) {
            mats.farmDirt = new THREE.MeshStandardMaterial({ color: 0x3d2817 });
            mats.crop = new THREE.MeshStandardMaterial({ color: 0xffdd44 });
        }
        const group = new THREE.Group(); group.position.set(pos.x, 0, pos.z);
        const dirt = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.2, 3.5), mats.farmDirt); dirt.position.y=0.1; group.add(dirt);
        super(group, farms, 1);
        this.crops = []; this.growth = 0; this.isReady = false;
        [[-1,-1],[1,-1],[-1,1],[1,1],[0,0]].forEach(p=>{
            let c = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.0, 4), mats.crop);
            c.position.set(p[0],0.5,p[1]); c.scale.setScalar(0.01); group.add(c); this.crops.push(c);
        });
    }
    update(delta) {
        if (this.growth < 100) {
            this.growth += delta * SIM.farmGrowSpeed * (window.currentWeather === 'RAIN' ? 3 : 1);
            let s = Math.max(0.01, this.growth/100);
            this.crops.forEach(c=>c.scale.set(s, s*1.5, s));
            if(this.growth >= 100) { this.growth = 100; this.isReady = true; }
        }
    }
    harvest() {
        if(this.isReady) {
            this.growth = 0; this.isReady = false; this.crops.forEach(c=>c.scale.setScalar(0.01));
            return true;
        } return false;
    }
}

class Animal extends WorldObject {
    constructor(pos) {
        if(!mats.animal) mats.animal = new THREE.MeshStandardMaterial({ color: 0xffb6c1 });
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.8, 16, 16), mats.animal);
        mesh.position.set(pos.x, 0.8, pos.z);
        super(mesh, animals, 1);
        this.health = 50; this.size = 1.0; this.theta = Math.random() * Math.PI * 2;
        this.isHuntable = false;
    }
    update(delta) {
        const cur = this.mesh.scale.x; 
        const n = cur + (this.size - cur) * delta * 2;
        this.mesh.scale.set(n, n*(1+Math.sin(Date.now()*0.01)*0.05), n);
        
        if (this.size >= 2.0) this.isHuntable = true;
        
        // Wander
        if(Math.random()<0.02) this.theta += (Math.random()-0.5);
        this.mesh.position.x += Math.sin(this.theta)*delta*1.5; 
        this.mesh.position.z += Math.cos(this.theta)*delta*1.5;
        if(this.mesh.position.x**2 + this.mesh.position.z**2 > 9000) this.theta += Math.PI;
    }
    takeDamage(dmg) {
        this.health -= dmg;
        if(this.health <= 0) {
            for(let i=0; i<3; i++) new Food({x: this.mesh.position.x+(Math.random()-0.5)*2, z: this.mesh.position.z+(Math.random()-0.5)*2}, true);
            this.destroy(); return true;
        }
        return false;
    }
}

// ==========================================
// --- Ultimate Gus AI (Fluid & Smart) ---
// ==========================================
class Gus {
    constructor(pos, energy = 80) {
        this.group = new THREE.Group(); this.dead = false; this.energy = energy;
        this.group.position.set(pos.x, 0, pos.z);
        this.velocity = new THREE.Vector3(0,0,0);
        this.targetObj = null; this.action = 'wander'; this.wood = 0;
        
        if(!mats.gusMiner) {
            mats.gusMiner = new THREE.MeshStandardMaterial({ color: 0x888888 });
            mats.gusFarmer = new THREE.MeshStandardMaterial({ color: 0x55cc55 });
            mats.gusBuilder = new THREE.MeshStandardMaterial({ color: 0xcc7722 });
        }
        this.role = ['miner','builder','farmer'][Math.floor(Math.random()*3)];
        
        const body = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 16).scale(0.7, 1.2, 0.7), 
            this.role === 'miner' ? mats.gusMiner : (this.role === 'farmer' ? mats.gusFarmer : mats.gusBuilder));
        body.position.y = 1.2; this.group.add(body);
        
        if(scene) scene.add(this.group);
    }

    clearTarget() {
        if (this.targetObj && !this.targetObj.dead) this.targetObj.workers = Math.max(0, this.targetObj.workers - 1);
        this.targetObj = null; this.action = 'wander';
    }

    findClosest(array, requireReady = false) {
        let closest = null; let minDist = Infinity;
        for (let obj of array) {
            if (obj.dead || obj.falling || obj.workers >= obj.maxWorkers) continue;
            if (requireReady && obj.isReady === false) continue;
            if (requireReady && obj.isHuntable === false) continue;
            let d = this.group.position.distanceToSquared(obj.mesh.position);
            if (d < minDist) { minDist = d; closest = obj; }
        }
        return closest;
    }

    update(delta) {
        if (this.dead) return;
        this.energy -= SIM.energyDrain * delta * 60;
        if(this.energy <= 0) { this.dead = true; scene.remove(this.group); return; }

        if (!this.targetObj || this.targetObj.dead || this.targetObj.falling) {
            this.clearTarget();
            
            // Priority System (GOAP)
            let roll = Math.random();
            if (this.energy < 50) { 
                this.targetObj = this.findClosest(foods); this.action = 'eat'; 
            } else if (roll < pBreed && farms.length > 0) {
                this.targetObj = this.findClosest(farms, true); this.action = 'harvest';
                if(!this.targetObj && this.wood >= 2) this.action = 'build_farm';
            } else if (roll < pHouse && this.wood >= 3) {
                this.targetObj = this.findClosest(houses); this.action = 'build_house';
                if(!this.targetObj && houses.length < 15) this.action = 'spawn_house';
            } else if (roll < pTrees) {
                this.targetObj = this.findClosest(trees); this.action = 'chop';
            } else if (animals.length > 0) {
                this.targetObj = this.findClosest(animals, true); this.action = 'hunt';
            }

            if (this.targetObj) this.targetObj.workers++;
        }

        let desiredVelocity = new THREE.Vector3(0,0,0);
        let speedMult = (window.currentWeather === 'RAIN' ? 0.7 : 1.0); // Mud slows them down

        if (this.action === 'spawn_house') {
            this.wood -= 3; new Skyscraper(this.group.position); this.clearTarget();
        } else if (this.action === 'build_farm') {
            this.wood -= 2; new Farm(this.group.position); this.clearTarget();
        } else if (this.targetObj) {
            let dist = this.group.position.distanceTo(this.targetObj.mesh.position);
            if (dist > 2.5) {
                desiredVelocity.subVectors(this.targetObj.mesh.position, this.group.position).normalize().multiplyScalar(SIM.speed * speedMult);
            } else {
                if (this.action === 'chop' && this.targetObj.chop(30 * delta)) { this.wood += 2; this.clearTarget(); }
                else if (this.action === 'build_house') { this.targetObj.build(30 * delta); if(this.wood-- <= 0) this.clearTarget(); }
                else if (this.action === 'eat') { this.energy += (this.targetObj.isMeat ? SIM.meatEnergy : SIM.foodEnergy); this.targetObj.destroy(); this.clearTarget(); }
                else if (this.action === 'harvest') { if(this.targetObj.harvest()) this.clearTarget(); }
                else if (this.action === 'hunt') { if(this.targetObj.takeDamage(40 * delta)) this.clearTarget(); }
            }
        } else {
            desiredVelocity.set(Math.sin(Date.now()*0.001 + this.group.id), 0, Math.cos(Date.now()*0.001 + this.group.id)).multiplyScalar(SIM.speed * 0.4);
        }

        // Fluid Repulsion 
        let separation = new THREE.Vector3(); let closeCount = 0;
        for(let other of gussArray) {
            if (other === this || other.dead) continue;
            let dist = this.group.position.distanceTo(other.group.position);
            if (dist < SIM.repelRadius) {
                let push = new THREE.Vector3().subVectors(this.group.position, other.group.position);
                push.normalize().divideScalar(Math.max(0.1, dist)).multiplyScalar(SIM.repelForce);
                separation.add(push); closeCount++;
            }
        }
        if (closeCount > 0) desiredVelocity.add(separation.divideScalar(closeCount));

        // Apply Easing & Move
        this.velocity.lerp(desiredVelocity, delta * 5);
        if (this.velocity.lengthSq() > 0.0001) {
            this.group.position.add(this.velocity);
            const tgtRot = Math.atan2(this.velocity.x, this.velocity.z);
            this.group.quaternion.slerp(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), tgtRot), delta * SIM.maxTurnSpeed);
        }

        if(this.group.position.lengthSq() > SIM.diskRadius * SIM.diskRadius) this.group.position.multiplyScalar(0.98);

        // Reproduction (Soft Cap penalty)
        let popPenalty = Math.max(1, gussArray.length / 50);
        if (this.energy > 160 * popPenalty) {
            this.energy -= 80; gussArray.push(new Gus({x: this.group.position.x+2, z: this.group.position.z+2}, 60));
        }
    }
}
