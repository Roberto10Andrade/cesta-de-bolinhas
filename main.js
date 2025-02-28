import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import * as CANNON from 'cannon-es';
import { GUI } from 'dat.gui';

class BallGame {
    constructor() {
        // Configuração básica
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(this.renderer.domElement);

        // Física
        this.world = new CANNON.World();
        this.world.gravity.set(0, -9.82, 0);
        
        // Arrays para gerenciar bolas
        this.balls = [];
        this.ballBodies = [];
        
        // Pontuação e tempo
        this.score = 0;
        this.timeLeft = 60;
        this.gameActive = false; // Começa inativo
        
        // Configurações do jogo
        this.gameSettings = {
            gravity: 9.82,
            ballSpeed: 1,
            spawnRate: 1000
        };
        
        // Carregar texturas
        this.textureLoader = new THREE.TextureLoader();
        this.ballTextures = [
            'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_atmos_2048.jpg',
            'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/jupiter_2048.jpg',
            'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/mars_2048.jpg'
        ].map(url => this.textureLoader.load(url));

        // Carregar sons
        this.audioLoader = new THREE.AudioLoader();
        this.listener = new THREE.AudioListener();
        this.camera.add(this.listener);
        
        this.sounds = {
            collision: new THREE.Audio(this.listener),
            score: new THREE.Audio(this.listener),
            special: new THREE.Audio(this.listener)
        };

        // Estatísticas do jogo
        this.gameStats = {
            ballsCaught: 0,
            specialBallsCaught: 0
        };

        // Elementos da UI
        this.startScreen = document.getElementById('startScreen');
        this.gameOverScreen = document.getElementById('gameOverScreen');
        this.levelCompleteScreen = document.getElementById('levelCompleteScreen');
        this.startButton = document.getElementById('startButton');
        this.playAgainButton = document.getElementById('playAgainButton');
        this.nextLevelButton = document.getElementById('nextLevelButton');

        // Configurar eventos
        this.startButton.addEventListener('click', () => this.startGame());
        this.playAgainButton.addEventListener('click', () => this.restartGame());
        this.nextLevelButton.addEventListener('click', () => this.startNextLevel());

        // Esconder elementos do jogo até começar
        document.getElementById('score').style.display = 'none';
        document.getElementById('timer').style.display = 'none';
        document.getElementById('level').style.display = 'none';
        document.getElementById('target').style.display = 'none';

        // Mostrar tela inicial
        this.startScreen.style.display = 'block';
        this.gameOverScreen.style.display = 'none';
        this.levelCompleteScreen.style.display = 'none';

        // Sistema de níveis
        this.levelSystem = {
            currentLevel: 1,
            maxLevel: 5,
            levelConfigs: {
                1: {
                    name: "Iniciante",
                    spawnRate: 2000,
                    ballSpeed: 1,
                    targetScore: 30,
                    timeLimit: 60,
                    specialBallChance: 0.2,
                    obstacles: false,
                    wind: false
                },
                2: {
                    name: "Intermediário",
                    spawnRate: 1500,
                    ballSpeed: 1.5,
                    targetScore: 50,
                    timeLimit: 50,
                    specialBallChance: 0.3,
                    obstacles: true,
                    wind: false
                },
                3: {
                    name: "Avançado",
                    spawnRate: 1200,
                    ballSpeed: 2,
                    targetScore: 80,
                    timeLimit: 45,
                    specialBallChance: 0.4,
                    obstacles: true,
                    wind: true
                },
                4: {
                    name: "Profissional",
                    spawnRate: 1000,
                    ballSpeed: 2.5,
                    targetScore: 100,
                    timeLimit: 40,
                    specialBallChance: 0.5,
                    obstacles: true,
                    wind: true,
                    movingObstacles: true
                },
                5: {
                    name: "Mestre",
                    spawnRate: 800,
                    ballSpeed: 3,
                    targetScore: 150,
                    timeLimit: 30,
                    specialBallChance: 0.6,
                    obstacles: true,
                    wind: true,
                    movingObstacles: true,
                    rotatingPlatforms: true
                }
            }
        };

        // Obstáculos e elementos do nível
        this.levelElements = {
            obstacles: [],
            platforms: [],
            windParticles: []
        };

        // Sistema de vento
        this.windSystem = {
            active: false,
            direction: new THREE.Vector3(1, 0, 0),
            strength: 0,
            particles: []
        };

        this.loadSounds();
        this.setupScene();
        this.setupBasket();
        this.setupGUI();
        this.setupEventListeners();
        this.animate();
    }

    loadSounds() {
        this.audioLoader.load('https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/sounds/ping_pong.mp3', (buffer) => {
            this.sounds.collision.setBuffer(buffer);
            this.sounds.collision.setVolume(0.5);
        });

        this.audioLoader.load('https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/sounds/click.ogg', (buffer) => {
            this.sounds.score.setBuffer(buffer);
            this.sounds.score.setVolume(0.7);
        });

        this.audioLoader.load('https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/sounds/door.ogg', (buffer) => {
            this.sounds.special.setBuffer(buffer);
            this.sounds.special.setVolume(0.7);
        });
    }

    updateTimer() {
        const timerElement = document.getElementById('timer');
        
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }
        
        this.timerInterval = setInterval(() => {
            if (!this.gameActive) {
                clearInterval(this.timerInterval);
                return;
            }
            
            this.timeLeft--;
            timerElement.textContent = `Tempo: ${this.timeLeft}s`;
            
            if (this.timeLeft <= 0) {
                clearInterval(this.timerInterval);
                this.showGameOver();
            }
        }, 1000);
    }

    setupScene() {
        this.camera.position.set(0, 10, 20);
        
        // Luz
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(10, 20, 10);
        this.scene.add(directionalLight);

        // Ponto de luz para brilho
        const pointLight = new THREE.PointLight(0x4444ff, 1, 50);
        pointLight.position.set(0, 10, 0);
        this.scene.add(pointLight);
        
        // Chão com efeito espacial
        const groundGeometry = new THREE.PlaneGeometry(50, 50, 100, 100);
        const groundMaterial = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                color1: { value: new THREE.Color(0x000066) },
                color2: { value: new THREE.Color(0x4444ff) },
                gridColor: { value: new THREE.Color(0x00ffff) }
            },
            vertexShader: `
                varying vec2 vUv;
                varying float vElevation;
                uniform float time;
                
                void main() {
                    vUv = uv;
                    vec4 modelPosition = modelMatrix * vec4(position, 1.0);
                    
                    // Criar ondulação suave
                    float elevation = sin(modelPosition.x * 2.0 + time) * 
                                    sin(modelPosition.z * 2.0 + time) * 0.2;
                    modelPosition.y += elevation;
                    vElevation = elevation;
                    
                    vec4 viewPosition = viewMatrix * modelPosition;
                    vec4 projectedPosition = projectionMatrix * viewPosition;
                    gl_Position = projectedPosition;
                }
            `,
            fragmentShader: `
                uniform float time;
                uniform vec3 color1;
                uniform vec3 color2;
                uniform vec3 gridColor;
                varying vec2 vUv;
                varying float vElevation;
                
                float grid(vec2 st, float res) {
                    vec2 grid = fract(st * res);
                    return (step(res, grid.x) * step(res, grid.y));
                }
                
                void main() {
                    // Grade principal
                    float mainGrid = grid(vUv, 0.1);
                    
                    // Grade secundária com movimento
                    vec2 movingUV = vUv + vec2(sin(time * 0.2) * 0.1, cos(time * 0.2) * 0.1);
                    float secondaryGrid = grid(movingUV, 0.05);
                    
                    // Efeito de pulso
                    float pulse = sin(time * 2.0) * 0.5 + 0.5;
                    
                    // Cor base com gradiente
                    vec3 baseColor = mix(color1, color2, vUv.y + sin(time * 0.5) * 0.2);
                    
                    // Adicionar brilho da grade
                    vec3 finalColor = mix(baseColor, gridColor, mainGrid * 0.5 * pulse);
                    finalColor = mix(finalColor, gridColor, secondaryGrid * 0.3);
                    
                    // Adicionar brilho nas bordas
                    float edgeBrightness = pow(1.0 - abs(vUv.y - 0.5) * 2.0, 2.0);
                    finalColor += gridColor * edgeBrightness * 0.2;
                    
                    // Adicionar efeito de energia baseado na elevação
                    float energyLine = abs(sin(vUv.x * 20.0 + time * 2.0));
                    finalColor += gridColor * energyLine * 0.1 * pulse;
                    
                    gl_FragColor = vec4(finalColor, 0.8);
                }
            `,
            side: THREE.DoubleSide,
            transparent: true
        });
        
        this.ground = new THREE.Mesh(groundGeometry, groundMaterial);
        this.ground.rotation.x = -Math.PI / 2;
        this.scene.add(this.ground);
        
        // Física do chão
        const groundBody = new CANNON.Body({
            mass: 0,
            shape: new CANNON.Plane()
        });
        groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
        this.world.addBody(groundBody);

        this.setupSkybox();
    }

    setupBasket() {
        // Criar cesta mais elaborada
        const basketGroup = new THREE.Group();
        
        // Base da cesta (cilindro principal)
        const basketGeometry = new THREE.CylinderGeometry(2, 1.5, 3, 32);
        const basketMaterial = new THREE.MeshPhongMaterial({ 
            color: 0xC0C0C0,
            metalness: 0.8,
            roughness: 0.2,
            emissive: 0x222222,
            emissiveIntensity: 0.2
        });
        const basketMesh = new THREE.Mesh(basketGeometry, basketMaterial);
        
        // Aro superior
        const rimGeometry = new THREE.TorusGeometry(2, 0.1, 16, 32);
        const rimMaterial = new THREE.MeshPhongMaterial({
            color: 0xFFD700,
            metalness: 1,
            roughness: 0.3,
            emissive: 0x444400,
            emissiveIntensity: 0.3
        });
        const rim = new THREE.Mesh(rimGeometry, rimMaterial);
        rim.position.y = 1.5;
        rim.rotation.x = Math.PI / 2;
        
        // Detalhes decorativos
        const detailsGeometry = new THREE.TorusGeometry(1.75, 0.05, 16, 16);
        const detailsMaterial = new THREE.MeshPhongMaterial({
            color: 0x4169E1,
            metalness: 0.6,
            roughness: 0.4,
            emissive: 0x000044,
            emissiveIntensity: 0.2
        });
        
        // Adicionar vários anéis decorativos
        for(let i = 0; i < 3; i++) {
            const detail = new THREE.Mesh(detailsGeometry, detailsMaterial);
            detail.position.y = -0.5 + i;
            detail.rotation.x = Math.PI / 2;
            basketGroup.add(detail);
        }
        
        // Adicionar efeito de brilho (glow)
        const glowGeometry = new THREE.CylinderGeometry(2.2, 1.7, 3.2, 32);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0x4444ff,
            transparent: true,
            opacity: 0.1,
            side: THREE.BackSide
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        
        // Montar a cesta
        basketGroup.add(basketMesh);
        basketGroup.add(rim);
        basketGroup.add(glow);
        
        this.basket = basketGroup;
        this.scene.add(basketGroup);
        
        // Física da cesta
        const basketShape = new CANNON.Cylinder(2, 1.5, 3, 32);
        this.basketBody = new CANNON.Body({ mass: 0, shape: basketShape });
        this.world.addBody(this.basketBody);
    }

    createBall() {
        if (!this.gameActive) return;

        const radius = 0.5;
        const ballGeometry = new THREE.SphereGeometry(radius);
        
        // Chance de criar uma bola especial
        const isSpecial = Math.random() < 0.2;
        const ballMaterial = new THREE.MeshStandardMaterial({ 
            map: this.ballTextures[Math.floor(Math.random() * this.ballTextures.length)],
            emissive: isSpecial ? 0xffff00 : 0x000000,
            emissiveIntensity: isSpecial ? 0.5 : 0
        });
        
        const ball = new THREE.Mesh(ballGeometry, ballMaterial);
        this.scene.add(ball);
        
        // Física da bola
        const ballShape = new CANNON.Sphere(radius);
        const ballBody = new CANNON.Body({
            mass: 1,
            shape: ballShape
        });
        
        ballBody.position.set(
            (Math.random() - 0.5) * 10,
            15,
            (Math.random() - 0.5) * 10
        );
        
        // Adicionar propriedades extras
        ball.isSpecial = isSpecial;
        ballBody.isSpecial = isSpecial;
        
        // Configurar callback de colisão
        ballBody.addEventListener('collide', (event) => {
            this.handleCollision(event, ball);
        });
        
        this.world.addBody(ballBody);
        this.balls.push(ball);
        this.ballBodies.push(ballBody);
    }

    handleCollision(event, ball) {
        // Tocar som de colisão
        if (!this.sounds.collision.isPlaying) {
            this.sounds.collision.play();
        }

        // Verificar se a bola caiu na cesta
        const basketPosition = this.basketBody.position;
        const ballPosition = event.target.position;
        
        const horizontalDistance = Math.sqrt(
            Math.pow(basketPosition.x - ballPosition.x, 2) +
            Math.pow(basketPosition.z - ballPosition.z, 2)
        );

        if (horizontalDistance < 2 && // Dentro do raio da cesta
            ballPosition.y < basketPosition.y + 1.5 && // Altura apropriada
            ballPosition.y > basketPosition.y - 1.5) {
            
            // Atualizar estatísticas
            this.gameStats.ballsCaught++;
            if (ball.isSpecial) {
                this.gameStats.specialBallsCaught++;
            }

            // Pontuar
            const points = ball.isSpecial ? 3 : 1;
            this.score += points;
            document.getElementById('score').textContent = `Pontos: ${this.score}`;

            // Debug
            console.log('Pontuação atual:', this.score);
            console.log('Pontuação alvo:', this.levelSystem.levelConfigs[this.levelSystem.currentLevel].targetScore);

            // Verificar conclusão do nível
            const config = this.levelSystem.levelConfigs[this.levelSystem.currentLevel];
            if (this.score >= config.targetScore) {
                console.log('Nível completo! Mostrando tela...');
                if (this.levelSystem.currentLevel < this.levelSystem.maxLevel) {
                    this.showLevelCompleteScreen();
                } else {
                    this.showGameCompleteScreen();
                }
                return;
            }

            // Tocar som apropriado
            const sound = ball.isSpecial ? this.sounds.special : this.sounds.score;
            if (!sound.isPlaying) {
                sound.play();
            }

            // Remover a bola
            this.removeBall(ball);
        }
    }

    removeBall(ball) {
        const index = this.balls.indexOf(ball);
        if (index > -1) {
            // Remover da cena
            this.scene.remove(ball);
            this.world.removeBody(this.ballBodies[index]);
            
            // Remover dos arrays
            this.balls.splice(index, 1);
            this.ballBodies.splice(index, 1);
        }
    }

    setupGUI() {
        const gui = new GUI();
        gui.add(this.gameSettings, 'gravity', 0, 20).onChange((value) => {
            this.world.gravity.set(0, -value, 0);
        });
        gui.add(this.gameSettings, 'ballSpeed', 0.1, 3);
        gui.add(this.gameSettings, 'spawnRate', 500, 3000);
    }

    setupEventListeners() {
        // Movimento da cesta com o mouse
        document.addEventListener('mousemove', (event) => {
            if (this.gameActive) {
                const mouseX = (event.clientX / window.innerWidth) * 2 - 1;
                const mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
                this.basket.position.x = mouseX * 10;
                this.basket.position.z = mouseY * 10;
            }
        });
    }

    setupSkybox() {
        // Fundo espacial com efeitos cósmicos avançados
        const skyGeometry = new THREE.SphereGeometry(500, 60, 60);
        const skyMaterial = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) }
            },
            vertexShader: `
                varying vec3 vWorldPosition;
                varying vec2 vUv;
                void main() {
                    vWorldPosition = position;
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                uniform vec2 resolution;
                varying vec2 vUv;
                varying vec3 vWorldPosition;

                // Funções de ruído melhoradas
                float hash(vec2 p) {
                    p = fract(p * vec2(234.34, 435.345));
                    p += dot(p, p + 34.23);
                    return fract(p.x * p.y);
                }

                float noise(vec2 p) {
                    vec2 i = floor(p);
                    vec2 f = fract(p);
                    f = f * f * (3.0 - 2.0 * f);
                    
                    float a = hash(i);
                    float b = hash(i + vec2(1.0, 0.0));
                    float c = hash(i + vec2(0.0, 1.0));
                    float d = hash(i + vec2(1.0, 1.0));
                    
                    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
                }

                float fbm(vec2 p) {
                    float value = 0.0;
                    float amplitude = 0.5;
                    float frequency = 1.0;
                    for(int i = 0; i < 6; i++) {
                        value += amplitude * noise(p * frequency);
                        amplitude *= 0.5;
                        frequency *= 2.0;
                    }
                    return value;
                }

                vec3 createNebula(vec2 uv) {
                    float n = fbm(uv * 3.0 + time * 0.1);
                    n += fbm(uv * 6.0 - time * 0.15) * 0.5;
                    
                    // Cores mais vibrantes para as nebulosas
                    vec3 color1 = vec3(0.8, 0.0, 1.0); // Roxo intenso
                    vec3 color2 = vec3(0.0, 0.7, 1.0); // Azul brilhante
                    vec3 color3 = vec3(1.0, 0.2, 0.8); // Rosa vibrante
                    vec3 color4 = vec3(0.2, 1.0, 0.5); // Verde neon
                    
                    // Mistura mais complexa de cores
                    vec3 nebulaColor = mix(color1, color2, n);
                    nebulaColor = mix(nebulaColor, color3, fbm(uv * 4.0 + vec2(time * 0.2)));
                    nebulaColor = mix(nebulaColor, color4, fbm(uv * 5.0 - vec2(time * 0.15)));
                    
                    // Adicionar brilho pulsante
                    float pulse = sin(time * 0.5) * 0.5 + 0.5;
                    return nebulaColor * (n * 1.5 + pulse * 0.3);
                }

                vec3 createGalaxy(vec2 uv) {
                    // Espiral mais complexa
                    float spiral = length(uv) - 0.7 * atan(uv.y, uv.x);
                    spiral = sin(spiral * 15.0 + time) * 0.5 + 0.5;
                    
                    // Cores mais vibrantes para a galáxia
                    vec3 galaxyColor1 = vec3(1.0, 0.4, 0.0); // Laranja brilhante
                    vec3 galaxyColor2 = vec3(0.0, 0.8, 1.0); // Azul ciano
                    vec3 galaxyColor3 = vec3(1.0, 0.2, 0.5); // Rosa quente
                    
                    vec3 galaxyColor = galaxyColor1 * spiral;
                    galaxyColor += galaxyColor2 * (1.0 - spiral);
                    galaxyColor = mix(galaxyColor, galaxyColor3, fbm(uv * 3.0 + time * 0.1));
                    
                    // Adicionar turbulência
                    float turb = fbm(uv * 8.0 + time * 0.2);
                    return galaxyColor * (fbm(uv * 5.0) + turb * 0.5);
                }

                void main() {
                    vec2 uv = vUv * 2.0 - 1.0;
                    
                    // Cor base do espaço mais profunda e rica
                    vec3 color = vec3(0.02, 0.05, 0.1);
                    
                    // Adicionar nebulosas com mais intensidade
                    color += createNebula(uv + vec2(time * 0.02)) * 1.5;
                    
                    // Adicionar galáxias distantes com mais brilho
                    color += createGalaxy(uv * 2.0) * 0.5;
                    
                    // Estrelas mais brilhantes e variadas
                    float stars = hash(uv * 1000.0 + time);
                    stars = pow(stars, 15.0) * 2.0;
                    color += vec3(1.0, 0.95, 0.8) * stars;
                    
                    // Estrelas grandes com brilho colorido
                    float brightStars = hash(uv * 500.0 + time * 0.5);
                    brightStars = pow(brightStars, 40.0) * 4.0;
                    vec3 starColor = mix(
                        vec3(1.0, 0.6, 0.3),  // Cor quente
                        vec3(0.3, 0.6, 1.0),  // Cor fria
                        hash(uv * 100.0)      // Variação aleatória
                    );
                    color += starColor * brightStars;
                    
                    // Adicionar efeito de brilho atmosférico
                    float atmosphere = length(uv);
                    atmosphere = 1.0 - smoothstep(0.0, 2.0, atmosphere);
                    color += vec3(0.1, 0.2, 0.4) * atmosphere * 0.3;
                    
                    // Ajuste de brilho e contraste mais intenso
                    color = pow(color, vec3(0.7));  // Menos compressão
                    color *= 1.4;                   // Mais brilho
                    
                    // Ajuste de saturação
                    float luminance = dot(color, vec3(0.299, 0.587, 0.114));
                    color = mix(vec3(luminance), color, 1.3); // Aumentar saturação
                    
                    gl_FragColor = vec4(color, 1.0);
                }
            `,
            side: THREE.BackSide
        });

        const sky = new THREE.Mesh(skyGeometry, skyMaterial);
        this.sky = sky;
        this.scene.add(sky);

        // Adicionar efeito de poeira estelar
        const starsGeometry = new THREE.BufferGeometry();
        const starsCount = 8000;
        const starsPositions = new Float32Array(starsCount * 3);
        const starsSizes = new Float32Array(starsCount);
        const starsColors = new Float32Array(starsCount * 3);

        for(let i = 0; i < starsCount; i++) {
            const i3 = i * 3;
            const radius = 400;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(Math.random() * 2 - 1);
            
            starsPositions[i3] = radius * Math.sin(phi) * Math.cos(theta);
            starsPositions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
            starsPositions[i3 + 2] = radius * Math.cos(phi);
            
            // Tamanhos variados de estrelas
            starsSizes[i] = Math.random() * 4 + 0.5;
            
            // Cores variadas para diferentes tipos de estrelas
            const starType = Math.random();
            let color;
            if (starType < 0.2) {
                // Estrelas azuis (quentes)
                color = new THREE.Color(0x4169E1);
            } else if (starType < 0.4) {
                // Estrelas brancas
                color = new THREE.Color(0xFFFFFF);
            } else if (starType < 0.6) {
                // Estrelas amarelas
                color = new THREE.Color(0xFFD700);
            } else if (starType < 0.8) {
                // Estrelas laranjas
                color = new THREE.Color(0xFFA500);
            } else {
                // Estrelas vermelhas
                color = new THREE.Color(0xFF4500);
            }
            
            starsColors[i3] = color.r;
            starsColors[i3 + 1] = color.g;
            starsColors[i3 + 2] = color.b;
        }

        starsGeometry.setAttribute('position', new THREE.BufferAttribute(starsPositions, 3));
        starsGeometry.setAttribute('size', new THREE.BufferAttribute(starsSizes, 1));
        starsGeometry.setAttribute('color', new THREE.BufferAttribute(starsColors, 3));

        const starsMaterial = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 }
            },
            vertexShader: `
                attribute float size;
                attribute vec3 color;
                varying vec3 vColor;
                uniform float time;
                
                void main() {
                    vColor = color;
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    float pulse = sin(time * 2.0 + length(position)) * 0.3 + 0.7;
                    gl_PointSize = size * pulse * (300.0 / -mvPosition.z);
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                varying vec3 vColor;
                
                void main() {
                    vec2 center = gl_PointCoord - vec2(0.5);
                    float dist = length(center);
                    float alpha = 1.0 - smoothstep(0.2, 0.5, dist);
                    vec3 glow = vColor * (1.0 - dist * 2.0);
                    gl_FragColor = vec4(glow, alpha);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        const stars = new THREE.Points(starsGeometry, starsMaterial);
        this.stars = stars;
        this.scene.add(stars);
    }

    animate() {
        requestAnimationFrame(this.animate.bind(this));

        // Atualizar física
        this.world.step(1 / 60);

        // Atualizar posições das bolas
        for (let i = 0; i < this.balls.length; i++) {
            this.balls[i].position.copy(this.ballBodies[i].position);
            this.balls[i].quaternion.copy(this.ballBodies[i].quaternion);
        }

        // Animar o chão
        if (this.ground && this.ground.material.uniforms) {
            this.ground.material.uniforms.time.value = Date.now() * 0.001;
        }

        // Animar o céu e o sol
        const time = Date.now() * 0.001;
        if (this.sky) {
            this.sky.material.uniforms.time.value = time;
        }
        if (this.stars) {
            this.stars.material.uniforms.time.value = time;
        }

        // Atualizar posição da cesta física para seguir o visual
        this.basketBody.position.copy(this.basket.position);
        this.basketBody.quaternion.copy(this.basket.quaternion);

        // Atualizar obstáculos móveis
        this.levelElements.obstacles.forEach(obstacle => {
            if (obstacle.movement) {
                const movement = obstacle.movement;
                const newX = obstacle.initialPosition.x + Math.sin(time * movement.speed) * movement.range;
                obstacle.mesh.position.x = newX;
                obstacle.body.position.x = newX;
            }
        });

        // Atualizar plataformas giratórias
        this.levelElements.platforms.forEach(platform => {
            if (platform.rotation) {
                platform.mesh.rotation[platform.rotation.axis] += platform.rotation.speed;
                platform.body.quaternion.copy(platform.mesh.quaternion);
            }
        });

        // Atualizar efeito de vento
        if (this.windSystem.active) {
            const positions = this.windSystem.particles.geometry.attributes.position.array;
            for (let i = 0; i < positions.length; i += 3) {
                positions[i] += this.windSystem.direction.x * this.windSystem.strength * 0.1;
                if (positions[i] > 20) positions[i] = -20;
                if (positions[i] < -20) positions[i] = 20;
            }
            this.windSystem.particles.geometry.attributes.position.needsUpdate = true;

            // Aplicar força do vento nas bolas
            this.ballBodies.forEach(ballBody => {
                ballBody.applyForce(
                    new CANNON.Vec3(
                        this.windSystem.direction.x * this.windSystem.strength,
                        0,
                        this.windSystem.direction.z * this.windSystem.strength
                    ),
                    ballBody.position
                );
            });
        }

        this.renderer.render(this.scene, this.camera);
    }

    startGame() {
        // Esconder tela inicial
        this.startScreen.style.display = 'none';
        
        // Mostrar elementos do jogo
        document.getElementById('score').style.display = 'block';
        document.getElementById('timer').style.display = 'block';
        document.getElementById('level').style.display = 'block';
        document.getElementById('target').style.display = 'block';
        
        // Limpar timer anterior se existir
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }
        
        // Ativar o jogo
        this.gameActive = true;
        this.timeLeft = this.levelSystem.levelConfigs[this.levelSystem.currentLevel].timeLimit;
        this.score = 0;
        
        // Atualizar UI
        document.getElementById('score').textContent = 'Pontos: 0';
        document.getElementById('timer').textContent = `Tempo: ${this.timeLeft}s`;
        
        // Iniciar spawn de bolas
        this.spawnBalls();
        
        // Iniciar timer
        this.updateTimer();
    }

    spawnBalls() {
        if (this.gameActive) {
            this.createBall();
            setTimeout(() => this.spawnBalls(), this.gameSettings.spawnRate);
        }
    }

    showGameOver() {
        this.gameActive = false;
        
        // Limpar timer
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }
        
        // Atualizar estatísticas
        document.querySelector('.final-score').textContent = this.score;
        document.getElementById('ballsCaught').textContent = this.gameStats.ballsCaught;
        document.getElementById('specialBallsCaught').textContent = this.gameStats.specialBallsCaught;
        document.getElementById('totalTime').textContent = 60 - this.timeLeft;

        // Mostrar tela de fim de jogo
        const gameOverScreen = document.getElementById('gameOverScreen');
        gameOverScreen.style.display = 'flex';
        setTimeout(() => {
            gameOverScreen.classList.add('active');
        }, 100);
        
        // Adicionar mensagem de tempo esgotado
        const gameOverTitle = document.getElementById('gameOverTitle');
        if (gameOverTitle) {
            gameOverTitle.textContent = 'Tempo Esgotado!';
            gameOverTitle.style.color = '#ff4444';
            gameOverTitle.style.fontSize = '2em';
            gameOverTitle.style.marginBottom = '20px';
        }
        
        // Adicionar mensagem motivacional
        const motivationalMessage = document.createElement('p');
        motivationalMessage.textContent = 'Continue tentando! Você consegue fazer melhor!';
        motivationalMessage.style.color = '#4CAF50';
        motivationalMessage.style.fontSize = '1.2em';
        motivationalMessage.style.margin = '15px 0';
        
        const statsContainer = document.querySelector('.stats');
        if (statsContainer) {
            statsContainer.insertBefore(motivationalMessage, statsContainer.firstChild);
        }

        // Limpar todas as bolas existentes
        this.balls.forEach(ball => this.scene.remove(ball));
        this.ballBodies.forEach(body => this.world.removeBody(body));
        this.balls = [];
        this.ballBodies = [];

        // Esconder elementos do jogo
        document.getElementById('score').style.display = 'none';
        document.getElementById('timer').style.display = 'none';
        document.getElementById('level').style.display = 'none';
        document.getElementById('target').style.display = 'none';

        // Criar e animar confetes
        this.createConfetti();
    }

    createConfetti() {
        const colors = ['#FFD700', '#FFA500', '#4CAF50', '#2196F3', '#9C27B0'];
        const confettiCount = 100;

        for (let i = 0; i < confettiCount; i++) {
            const confetti = document.createElement('div');
            confetti.className = 'confetti';
            confetti.style.left = Math.random() * 100 + 'vw';
            confetti.style.animationDuration = (Math.random() * 3 + 2) + 's';
            confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            confetti.style.width = (Math.random() * 10 + 5) + 'px';
            confetti.style.height = confetti.style.width;
            document.body.appendChild(confetti);

            // Remover confete após a animação
            confetti.addEventListener('animationend', () => {
                confetti.remove();
            });
        }
    }

    restartGame() {
        // Resetar estatísticas
        this.score = 0;
        this.timeLeft = 60;
        this.gameStats.ballsCaught = 0;
        this.gameStats.specialBallsCaught = 0;
        
        // Atualizar UI
        document.getElementById('score').textContent = 'Pontos: 0';
        this.gameOverScreen.classList.remove('active');
        
        // Limpar bolas existentes
        this.balls.forEach(ball => this.scene.remove(ball));
        this.ballBodies.forEach(body => this.world.removeBody(body));
        this.balls = [];
        this.ballBodies = [];
        
        // Reiniciar jogo
        this.gameActive = true;
        this.startGame();
    }

    setupLevel(level) {
        const config = this.levelSystem.levelConfigs[level];
        
        // Limpar nível anterior
        this.clearLevel();
        
        // Configurar parâmetros do nível
        this.gameSettings.spawnRate = config.spawnRate;
        this.gameSettings.ballSpeed = config.ballSpeed;
        this.timeLeft = config.timeLimit;
        
        // Configurar obstáculos
        if (config.obstacles) {
            this.setupObstacles();
        }
        
        // Configurar vento
        if (config.wind) {
            this.setupWind();
        }
        
        // Configurar plataformas móveis
        if (config.movingObstacles) {
            this.setupMovingObstacles();
        }
        
        // Configurar plataformas giratórias
        if (config.rotatingPlatforms) {
            this.setupRotatingPlatforms();
        }

        // Atualizar UI do nível
        this.updateLevelUI();
    }

    setupObstacles() {
        const obstacleConfigs = [
            { position: new THREE.Vector3(5, 5, 0), size: new THREE.Vector3(1, 4, 1) },
            { position: new THREE.Vector3(-5, 5, 0), size: new THREE.Vector3(1, 4, 1) },
            { position: new THREE.Vector3(0, 5, 5), size: new THREE.Vector3(1, 4, 1) }
        ];

        obstacleConfigs.forEach(config => {
            // Criar obstáculo visual
            const geometry = new THREE.BoxGeometry(config.size.x, config.size.y, config.size.z);
            const material = new THREE.MeshPhongMaterial({
                color: 0x444444,
                transparent: true,
                opacity: 0.8
            });
            const obstacle = new THREE.Mesh(geometry, material);
            obstacle.position.copy(config.position);
            this.scene.add(obstacle);

            // Criar física do obstáculo
            const shape = new CANNON.Box(new CANNON.Vec3(
                config.size.x / 2,
                config.size.y / 2,
                config.size.z / 2
            ));
            const body = new CANNON.Body({ mass: 0, shape: shape });
            body.position.copy(config.position);
            this.world.addBody(body);

            this.levelElements.obstacles.push({ mesh: obstacle, body: body });
        });
    }

    setupMovingObstacles() {
        const movingObstacleConfigs = [
            {
                position: new THREE.Vector3(0, 5, 0),
                size: new THREE.Vector3(3, 0.5, 0.5),
                movement: {
                    axis: 'x',
                    range: 8,
                    speed: 0.05
                }
            }
        ];

        movingObstacleConfigs.forEach(config => {
            const geometry = new THREE.BoxGeometry(config.size.x, config.size.y, config.size.z);
            const material = new THREE.MeshPhongMaterial({
                color: 0xff4444,
                emissive: 0x441111
            });
            const obstacle = new THREE.Mesh(geometry, material);
            obstacle.position.copy(config.position);
            this.scene.add(obstacle);

            const shape = new CANNON.Box(new CANNON.Vec3(
                config.size.x / 2,
                config.size.y / 2,
                config.size.z / 2
            ));
            const body = new CANNON.Body({ mass: 0, shape: shape });
            body.position.copy(config.position);
            
            this.world.addBody(body);
            this.levelElements.obstacles.push({
                mesh: obstacle,
                body: body,
                movement: config.movement,
                initialPosition: config.position.clone()
            });
        });
    }

    setupRotatingPlatforms() {
        const platformConfigs = [
            {
                position: new THREE.Vector3(0, 3, 0),
                size: new THREE.Vector3(6, 0.2, 0.2),
                rotation: {
                    axis: 'y',
                    speed: 0.02
                }
            }
        ];

        platformConfigs.forEach(config => {
            const geometry = new THREE.BoxGeometry(config.size.x, config.size.y, config.size.z);
            const material = new THREE.MeshPhongMaterial({
                color: 0x44ff44,
                emissive: 0x114411
            });
            const platform = new THREE.Mesh(geometry, material);
            platform.position.copy(config.position);
            this.scene.add(platform);

            const shape = new CANNON.Box(new CANNON.Vec3(
                config.size.x / 2,
                config.size.y / 2,
                config.size.z / 2
            ));
            const body = new CANNON.Body({ mass: 0, shape: shape });
            body.position.copy(config.position);
            
            this.world.addBody(body);
            this.levelElements.platforms.push({
                mesh: platform,
                body: body,
                rotation: config.rotation
            });
        });
    }

    setupWind() {
        this.windSystem.active = true;
        this.windSystem.strength = 0.5 + (this.levelSystem.currentLevel * 0.2);
        
        // Criar partículas de vento
        const particleCount = 100;
        const particleGeometry = new THREE.BufferGeometry();
        const particlePositions = new Float32Array(particleCount * 3);

        for (let i = 0; i < particleCount * 3; i += 3) {
            particlePositions[i] = (Math.random() - 0.5) * 40;
            particlePositions[i + 1] = Math.random() * 20;
            particlePositions[i + 2] = (Math.random() - 0.5) * 40;
        }

        particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));

        const particleMaterial = new THREE.PointsMaterial({
            color: 0xaaaaaa,
            size: 0.1,
            transparent: true,
            opacity: 0.6
        });

        const particles = new THREE.Points(particleGeometry, particleMaterial);
        this.scene.add(particles);
        this.windSystem.particles = particles;
    }

    clearLevel() {
        // Limpar obstáculos
        this.levelElements.obstacles.forEach(obstacle => {
            this.scene.remove(obstacle.mesh);
            this.world.removeBody(obstacle.body);
        });
        this.levelElements.obstacles = [];

        // Limpar plataformas
        this.levelElements.platforms.forEach(platform => {
            this.scene.remove(platform.mesh);
            this.world.removeBody(platform.body);
        });
        this.levelElements.platforms = [];

        // Limpar sistema de vento
        if (this.windSystem.particles) {
            this.scene.remove(this.windSystem.particles);
        }
        this.windSystem.active = false;
    }

    updateLevelUI() {
        const config = this.levelSystem.levelConfigs[this.levelSystem.currentLevel];
        document.getElementById('level').textContent = `Nível ${this.levelSystem.currentLevel}: ${config.name}`;
        document.getElementById('target').textContent = `Objetivo: ${config.targetScore} pontos`;
    }

    checkLevelCompletion() {
        const config = this.levelSystem.levelConfigs[this.levelSystem.currentLevel];
        if (this.score >= config.targetScore) {
            if (this.levelSystem.currentLevel < this.levelSystem.maxLevel) {
                this.levelSystem.currentLevel++;
                this.showLevelCompleteScreen();
            } else {
                this.showGameCompleteScreen();
            }
        }
    }

    showLevelCompleteScreen() {
        this.gameActive = false;
        
        // Limpar timer
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }
        
        // Atualizar estatísticas do nível
        document.getElementById('levelScore').textContent = this.score;
        document.getElementById('levelTime').textContent = this.timeLeft;
        document.getElementById('levelBalls').textContent = this.gameStats.ballsCaught;

        // Limpar todas as bolas existentes
        this.balls.forEach(ball => this.scene.remove(ball));
        this.ballBodies.forEach(body => this.world.removeBody(body));
        this.balls = [];
        this.ballBodies = [];

        // Preparar informações do próximo nível
        const nextLevel = this.levelSystem.currentLevel + 1;
        if (nextLevel <= this.levelSystem.maxLevel) {
            const nextConfig = this.levelSystem.levelConfigs[nextLevel];
            document.getElementById('nextLevelName').textContent = nextConfig.name;

            // Listar novos desafios
            const challengesList = document.getElementById('nextLevelChallenges');
            challengesList.innerHTML = '';
            
            const challenges = [];
            if (nextConfig.obstacles && !this.levelSystem.levelConfigs[this.levelSystem.currentLevel].obstacles) {
                challenges.push('Obstáculos fixos');
            }
            if (nextConfig.wind && !this.levelSystem.levelConfigs[this.levelSystem.currentLevel].wind) {
                challenges.push('Efeito de vento');
            }
            if (nextConfig.movingObstacles && !this.levelSystem.levelConfigs[this.levelSystem.currentLevel].movingObstacles) {
                challenges.push('Obstáculos móveis');
            }
            if (nextConfig.rotatingPlatforms && !this.levelSystem.levelConfigs[this.levelSystem.currentLevel].rotatingPlatforms) {
                challenges.push('Plataformas giratórias');
            }

            challenges.push(`Velocidade aumentada: ${nextConfig.ballSpeed}x`);
            challenges.push(`Objetivo: ${nextConfig.targetScore} pontos`);
            challenges.push(`Tempo limite: ${nextConfig.timeLimit}s`);

            challenges.forEach((challenge, index) => {
                const li = document.createElement('li');
                li.textContent = challenge;
                li.style.animationDelay = `${index * 0.1}s`;
                challengesList.appendChild(li);
            });
        }

        // Mostrar tela de nível completo com fade in
        const levelCompleteScreen = document.getElementById('levelCompleteScreen');
        levelCompleteScreen.style.display = 'flex';
        setTimeout(() => {
            levelCompleteScreen.classList.add('active');
        }, 100);
        
        // Criar efeito de confete
        this.createConfetti();
    }

    startNextLevel() {
        // Esconder tela de nível completo
        this.levelCompleteScreen.classList.remove('active');
        
        // Incrementar nível
        this.levelSystem.currentLevel++;
        
        // Resetar pontuação e estatísticas do nível
        this.score = 0;
        this.gameStats.ballsCaught = 0;
        this.gameStats.specialBallsCaught = 0;
        
        // Atualizar UI
        document.getElementById('score').textContent = 'Pontos: 0';
        
        // Iniciar próximo nível
        this.gameActive = true;
        this.setupLevel(this.levelSystem.currentLevel);
        this.startGame();
    }

    showGameCompleteScreen() {
        this.gameActive = false;
        
        // Criar elemento de conclusão do jogo
        const gameComplete = document.createElement('div');
        gameComplete.className = 'modal active';
        gameComplete.innerHTML = `
            <h2 class="level-complete-title" style="color: gold;">Parabéns!</h2>
            <h3>Você completou todos os níveis!</h3>
            <div class="level-stats">
                <p>Pontuação Final: ${this.score}</p>
                <p>Total de Bolas: ${this.gameStats.ballsCaught}</p>
                <p>Bolas Especiais: ${this.gameStats.specialBallsCaught}</p>
            </div>
            <button onclick="location.reload()" class="next-level-button">
                Jogar Novamente
            </button>
        `;
        document.body.appendChild(gameComplete);
        
        // Criar efeito especial de confete
        this.createConfetti();
        setTimeout(() => this.createConfetti(), 1000);
        setTimeout(() => this.createConfetti(), 2000);
    }
}

// Iniciar o jogo
const game = new BallGame();
