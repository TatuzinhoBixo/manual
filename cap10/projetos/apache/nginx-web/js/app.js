/**
 * DevOps Toolkit - Main Application
 * Kubernetes resource calculator, YAML generator, and utilities
 */

(function() {
    'use strict';

    // ==========================================
    // Constants
    // ==========================================
    const STORAGE_KEY = 'devops-toolkit-data';

    // Memory units in bytes (binary - Kubernetes uses binary units)
    const MEMORY_UNITS = {
        bytes: 1,
        Ki: 1024,
        Mi: 1024 ** 2,
        Gi: 1024 ** 3,
        Ti: 1024 ** 4,
        KB: 1000,
        MB: 1000 ** 2,
        GB: 1000 ** 3
    };

    // CPU units
    const CPU_UNITS = {
        m: 1,      // millicores
        cores: 1000 // 1 core = 1000m
    };

    // ==========================================
    // State Management
    // ==========================================
    let appState = {
        theme: 'dark',
        lastCalculation: null,
        savedManifests: []
    };

    // ==========================================
    // Utility Functions
    // ==========================================

    /**
     * Show toast notification
     */
    function showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        const toastMessage = document.getElementById('toast-message');

        toastMessage.textContent = message;
        toast.className = 'toast show ' + type;

        setTimeout(() => {
            toast.className = 'toast hidden';
        }, 3000);
    }

    /**
     * Copy text to clipboard
     */
    async function copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            showToast('Copiado para a clipboard!', 'success');
        } catch (err) {
            // Fallback for older browsers
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            showToast('Copiado para a clipboard!', 'success');
        }
    }

    /**
     * Download file
     */
    function downloadFile(content, filename, type = 'text/yaml') {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('Download iniciado!', 'success');
    }

    /**
     * Format number with thousand separators
     */
    function formatNumber(num, decimals = 2) {
        if (num === null || num === undefined || isNaN(num)) return '-';
        return Number(num).toLocaleString('pt-BR', {
            minimumFractionDigits: 0,
            maximumFractionDigits: decimals
        });
    }

    /**
     * Save state to localStorage
     */
    function saveState() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
        } catch (e) {
            console.warn('Failed to save state:', e);
        }
    }

    /**
     * Load state from localStorage
     */
    function loadState() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                appState = { ...appState, ...JSON.parse(saved) };
            }
        } catch (e) {
            console.warn('Failed to load state:', e);
        }
    }

    // ==========================================
    // Theme Management
    // ==========================================

    function initTheme() {
        // Check saved preference or system preference
        const savedTheme = appState.theme;
        const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const theme = savedTheme || (systemPrefersDark ? 'dark' : 'light');

        document.documentElement.setAttribute('data-theme', theme);
        appState.theme = theme;
    }

    function toggleTheme() {
        const newTheme = appState.theme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        appState.theme = newTheme;
        saveState();
    }

    // ==========================================
    // Tab Navigation
    // ==========================================

    function initTabs() {
        const tabs = document.querySelectorAll('.nav-tab');
        const contents = document.querySelectorAll('.tab-content');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const targetId = tab.dataset.tab;

                // Update tabs
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                // Update content
                contents.forEach(c => c.classList.remove('active'));
                document.getElementById(targetId).classList.add('active');
            });
        });
    }

    // ==========================================
    // Calculator Module
    // ==========================================

    const Calculator = {
        init() {
            this.bindEvents();
        },

        bindEvents() {
            // Memory converter
            const memoryInput = document.getElementById('memory-value');
            const memoryUnit = document.getElementById('memory-unit-from');

            if (memoryInput && memoryUnit) {
                memoryInput.addEventListener('input', () => this.convertMemory());
                memoryUnit.addEventListener('change', () => this.convertMemory());
            }

            // CPU converter
            const cpuInput = document.getElementById('cpu-value');
            const cpuUnit = document.getElementById('cpu-unit-from');

            if (cpuInput && cpuUnit) {
                cpuInput.addEventListener('input', () => this.convertCPU());
                cpuUnit.addEventListener('change', () => this.convertCPU());
            }

            // Resource calculator
            const calcBtn = document.getElementById('calc-resources');
            if (calcBtn) {
                calcBtn.addEventListener('click', () => this.calculateResources());
            }
        },

        convertMemory() {
            const value = parseFloat(document.getElementById('memory-value').value);
            const fromUnit = document.getElementById('memory-unit-from').value;
            const resultsDiv = document.getElementById('memory-results');

            if (isNaN(value) || value < 0) {
                resultsDiv.innerHTML = '<p class="placeholder-text">Digite um valor válido</p>';
                return;
            }

            // Convert to bytes first
            const bytes = value * MEMORY_UNITS[fromUnit];

            // Convert to all units
            const results = {
                'Bytes': bytes,
                'Ki (Kibibytes)': bytes / MEMORY_UNITS.Ki,
                'Mi (Mebibytes)': bytes / MEMORY_UNITS.Mi,
                'Gi (Gibibytes)': bytes / MEMORY_UNITS.Gi,
                'Ti (Tebibytes)': bytes / MEMORY_UNITS.Ti,
                'KB (Kilobytes)': bytes / MEMORY_UNITS.KB,
                'MB (Megabytes)': bytes / MEMORY_UNITS.MB,
                'GB (Gigabytes)': bytes / MEMORY_UNITS.GB
            };

            let html = '';
            for (const [label, val] of Object.entries(results)) {
                const displayVal = val < 0.01 ? val.toExponential(2) : formatNumber(val, 4);
                html += `
                    <div class="result-item">
                        <span class="result-label">${label}</span>
                        <span class="result-value">${displayVal}</span>
                    </div>
                `;
            }

            resultsDiv.innerHTML = html;
        },

        convertCPU() {
            const value = parseFloat(document.getElementById('cpu-value').value);
            const fromUnit = document.getElementById('cpu-unit-from').value;
            const resultsDiv = document.getElementById('cpu-results');

            if (isNaN(value) || value < 0) {
                resultsDiv.innerHTML = '<p class="placeholder-text">Digite um valor válido</p>';
                return;
            }

            // Convert to millicores first
            const millicores = value * CPU_UNITS[fromUnit];

            const results = {
                'Millicores (m)': millicores,
                'Cores': millicores / 1000
            };

            let html = '';
            for (const [label, val] of Object.entries(results)) {
                html += `
                    <div class="result-item">
                        <span class="result-label">${label}</span>
                        <span class="result-value">${formatNumber(val, 3)}</span>
                    </div>
                `;
            }

            resultsDiv.innerHTML = html;
        },

        calculateResources() {
            const replicas = parseInt(document.getElementById('replicas').value) || 1;
            const cpuReq = parseInt(document.getElementById('cpu-request').value) || 0;
            const cpuLim = parseInt(document.getElementById('cpu-limit').value) || 0;
            const memReq = parseInt(document.getElementById('memory-request').value) || 0;
            const memLim = parseInt(document.getElementById('memory-limit').value) || 0;

            // Calculate totals
            const totalCpuReq = cpuReq * replicas;
            const totalCpuLim = cpuLim * replicas;
            const totalMemReq = memReq * replicas;
            const totalMemLim = memLim * replicas;

            const resultsDiv = document.getElementById('resource-results');
            resultsDiv.innerHTML = `
                <h4>Total de Recursos (${replicas} réplicas)</h4>
                <div class="results-grid">
                    <div class="result-box">
                        <div class="label">CPU Request Total</div>
                        <div class="value">${formatNumber(totalCpuReq)}m</div>
                        <div class="label">(${formatNumber(totalCpuReq/1000, 2)} cores)</div>
                    </div>
                    <div class="result-box">
                        <div class="label">CPU Limit Total</div>
                        <div class="value">${formatNumber(totalCpuLim)}m</div>
                        <div class="label">(${formatNumber(totalCpuLim/1000, 2)} cores)</div>
                    </div>
                    <div class="result-box">
                        <div class="label">Memory Request Total</div>
                        <div class="value">${formatNumber(totalMemReq)}Mi</div>
                        <div class="label">(${formatNumber(totalMemReq/1024, 2)} Gi)</div>
                    </div>
                    <div class="result-box">
                        <div class="label">Memory Limit Total</div>
                        <div class="value">${formatNumber(totalMemLim)}Mi</div>
                        <div class="label">(${formatNumber(totalMemLim/1024, 2)} Gi)</div>
                    </div>
                </div>
            `;

            // Update cost estimation
            this.calculateCost(totalCpuReq, totalMemReq);

            // Save to state
            appState.lastCalculation = {
                replicas, cpuReq, cpuLim, memReq, memLim,
                totalCpuReq, totalCpuLim, totalMemReq, totalMemLim
            };
            saveState();
        },

        calculateCost(totalCpuMillicores, totalMemMi) {
            const cpuCostPerHour = parseFloat(document.getElementById('cost-cpu-hour').value) || 0.05;
            const memCostPerHour = parseFloat(document.getElementById('cost-mem-hour').value) || 0.01;

            const cpuCores = totalCpuMillicores / 1000;
            const memGb = totalMemMi / 1024;

            const hourlyCost = (cpuCores * cpuCostPerHour) + (memGb * memCostPerHour);
            const dailyCost = hourlyCost * 24;
            const monthlyCost = dailyCost * 30;

            const costDiv = document.getElementById('cost-results');
            costDiv.innerHTML = `
                <div class="cost-grid">
                    <div class="cost-item">
                        <div class="label">Por Hora</div>
                        <div class="value">$${formatNumber(hourlyCost, 4)}</div>
                    </div>
                    <div class="cost-item">
                        <div class="label">Por Dia</div>
                        <div class="value">$${formatNumber(dailyCost, 2)}</div>
                    </div>
                    <div class="cost-item">
                        <div class="label">Por Mês (30 dias)</div>
                        <div class="value">$${formatNumber(monthlyCost, 2)}</div>
                    </div>
                </div>
            `;
        }
    };

    // ==========================================
    // YAML Generator Module
    // ==========================================

    const Generator = {
        envVarCount: 0,
        labelCount: 0,

        init() {
            this.bindEvents();
            this.updateFieldsetVisibility();
        },

        bindEvents() {
            // Manifest type toggles
            const manifestToggles = [
                'gen-deployment', 'gen-service', 'gen-ingress',
                'gen-configmap', 'gen-secret', 'gen-hpa'
            ];

            manifestToggles.forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    el.addEventListener('change', () => this.updateFieldsetVisibility());
                }
            });

            // Generate button
            const genBtn = document.getElementById('generate-yaml');
            if (genBtn) {
                genBtn.addEventListener('click', () => this.generateYAML());
            }

            // Clear button
            const clearBtn = document.getElementById('clear-generator');
            if (clearBtn) {
                clearBtn.addEventListener('click', () => this.clearForm());
            }

            // Copy/Download buttons
            const copyBtn = document.getElementById('copy-yaml');
            if (copyBtn) {
                copyBtn.addEventListener('click', () => {
                    const output = document.getElementById('yaml-output');
                    copyToClipboard(output.textContent);
                });
            }

            const downloadBtn = document.getElementById('download-yaml');
            if (downloadBtn) {
                downloadBtn.addEventListener('click', () => {
                    const output = document.getElementById('yaml-output');
                    const appName = document.getElementById('gen-app-name').value || 'manifest';
                    downloadFile(output.textContent, `${appName}.yaml`);
                });
            }

            // Add env var button
            const addEnvBtn = document.getElementById('add-env-var');
            if (addEnvBtn) {
                addEnvBtn.addEventListener('click', () => this.addEnvVar());
            }

            // Add label button
            const addLabelBtn = document.getElementById('add-label');
            if (addLabelBtn) {
                addLabelBtn.addEventListener('click', () => this.addLabel());
            }
        },

        updateFieldsetVisibility() {
            const serviceSettings = document.getElementById('service-settings');
            const ingressSettings = document.getElementById('ingress-settings');
            const hpaSettings = document.getElementById('hpa-settings');

            if (serviceSettings) {
                serviceSettings.classList.toggle('hidden', !document.getElementById('gen-service').checked);
            }
            if (ingressSettings) {
                ingressSettings.classList.toggle('hidden', !document.getElementById('gen-ingress').checked);
            }
            if (hpaSettings) {
                hpaSettings.classList.toggle('hidden', !document.getElementById('gen-hpa').checked);
            }
        },

        addEnvVar() {
            const container = document.getElementById('env-vars-container');
            const id = ++this.envVarCount;

            const row = document.createElement('div');
            row.className = 'env-var-row';
            row.innerHTML = `
                <input type="text" placeholder="KEY" class="env-key" id="env-key-${id}">
                <input type="text" placeholder="value" class="env-value" id="env-value-${id}">
                <button type="button" class="btn btn-icon btn-danger remove-env" title="Remover">✕</button>
            `;

            row.querySelector('.remove-env').addEventListener('click', () => row.remove());
            container.appendChild(row);
        },

        addLabel() {
            const container = document.getElementById('labels-container');
            const id = ++this.labelCount;

            const row = document.createElement('div');
            row.className = 'label-row';
            row.innerHTML = `
                <input type="text" placeholder="key" class="label-key" id="label-key-${id}">
                <input type="text" placeholder="value" class="label-value" id="label-value-${id}">
                <button type="button" class="btn btn-icon btn-danger remove-label" title="Remover">✕</button>
            `;

            row.querySelector('.remove-label').addEventListener('click', () => row.remove());
            container.appendChild(row);
        },

        getFormData() {
            return {
                appName: document.getElementById('gen-app-name').value.trim() || 'my-app',
                namespace: document.getElementById('gen-namespace').value.trim() || 'default',
                image: document.getElementById('gen-image').value.trim() || 'nginx:latest',
                replicas: parseInt(document.getElementById('gen-replicas').value) || 2,
                port: parseInt(document.getElementById('gen-port').value) || 80,
                protocol: document.getElementById('gen-protocol').value || 'TCP',
                cpuReq: document.getElementById('gen-cpu-req').value.trim() || '100m',
                cpuLim: document.getElementById('gen-cpu-lim').value.trim() || '500m',
                memReq: document.getElementById('gen-mem-req').value.trim() || '128Mi',
                memLim: document.getElementById('gen-mem-lim').value.trim() || '256Mi',
                serviceType: document.getElementById('gen-service-type').value || 'ClusterIP',
                servicePort: parseInt(document.getElementById('gen-service-port').value) || 80,
                ingressHost: document.getElementById('gen-ingress-host').value.trim(),
                ingressPath: document.getElementById('gen-ingress-path').value.trim() || '/',
                ingressClass: document.getElementById('gen-ingress-class').value.trim() || 'nginx',
                ingressTls: document.getElementById('gen-ingress-tls').checked,
                hpaMin: parseInt(document.getElementById('gen-hpa-min').value) || 2,
                hpaMax: parseInt(document.getElementById('gen-hpa-max').value) || 10,
                hpaCpu: parseInt(document.getElementById('gen-hpa-cpu').value) || 80,
                hpaMem: parseInt(document.getElementById('gen-hpa-mem').value) || 80,
                genDeployment: document.getElementById('gen-deployment').checked,
                genService: document.getElementById('gen-service').checked,
                genIngress: document.getElementById('gen-ingress').checked,
                genConfigMap: document.getElementById('gen-configmap').checked,
                genSecret: document.getElementById('gen-secret').checked,
                genHpa: document.getElementById('gen-hpa').checked
            };
        },

        getEnvVars() {
            const envVars = [];
            document.querySelectorAll('.env-var-row').forEach(row => {
                const key = row.querySelector('.env-key').value.trim();
                const value = row.querySelector('.env-value').value.trim();
                if (key) {
                    envVars.push({ name: key, value });
                }
            });
            return envVars;
        },

        getLabels() {
            const labels = {};
            document.querySelectorAll('.label-row').forEach(row => {
                const key = row.querySelector('.label-key').value.trim();
                const value = row.querySelector('.label-value').value.trim();
                if (key) {
                    labels[key] = value;
                }
            });
            return labels;
        },

        generateYAML() {
            const data = this.getFormData();
            const envVars = this.getEnvVars();
            const extraLabels = this.getLabels();
            const manifests = [];

            const commonLabels = {
                'app.kubernetes.io/name': data.appName,
                'app.kubernetes.io/instance': data.appName,
                'app.kubernetes.io/managed-by': 'devops-toolkit',
                ...extraLabels
            };

            // Generate Deployment
            if (data.genDeployment) {
                const deployment = {
                    apiVersion: 'apps/v1',
                    kind: 'Deployment',
                    metadata: {
                        name: data.appName,
                        namespace: data.namespace,
                        labels: commonLabels
                    },
                    spec: {
                        replicas: data.replicas,
                        selector: {
                            matchLabels: {
                                'app.kubernetes.io/name': data.appName,
                                'app.kubernetes.io/instance': data.appName
                            }
                        },
                        template: {
                            metadata: {
                                labels: {
                                    'app.kubernetes.io/name': data.appName,
                                    'app.kubernetes.io/instance': data.appName
                                }
                            },
                            spec: {
                                containers: [{
                                    name: data.appName,
                                    image: data.image,
                                    ports: [{
                                        containerPort: data.port,
                                        protocol: data.protocol
                                    }],
                                    resources: {
                                        requests: {
                                            cpu: data.cpuReq,
                                            memory: data.memReq
                                        },
                                        limits: {
                                            cpu: data.cpuLim,
                                            memory: data.memLim
                                        }
                                    }
                                }]
                            }
                        }
                    }
                };

                if (envVars.length > 0) {
                    deployment.spec.template.spec.containers[0].env = envVars;
                }

                manifests.push(deployment);
            }

            // Generate Service
            if (data.genService) {
                const service = {
                    apiVersion: 'v1',
                    kind: 'Service',
                    metadata: {
                        name: data.appName,
                        namespace: data.namespace,
                        labels: commonLabels
                    },
                    spec: {
                        type: data.serviceType,
                        selector: {
                            'app.kubernetes.io/name': data.appName,
                            'app.kubernetes.io/instance': data.appName
                        },
                        ports: [{
                            port: data.servicePort,
                            targetPort: data.port,
                            protocol: data.protocol
                        }]
                    }
                };

                manifests.push(service);
            }

            // Generate Ingress
            if (data.genIngress && data.ingressHost) {
                const ingress = {
                    apiVersion: 'networking.k8s.io/v1',
                    kind: 'Ingress',
                    metadata: {
                        name: data.appName,
                        namespace: data.namespace,
                        labels: commonLabels,
                        annotations: {
                            'kubernetes.io/ingress.class': data.ingressClass
                        }
                    },
                    spec: {
                        rules: [{
                            host: data.ingressHost,
                            http: {
                                paths: [{
                                    path: data.ingressPath,
                                    pathType: 'Prefix',
                                    backend: {
                                        service: {
                                            name: data.appName,
                                            port: {
                                                number: data.servicePort
                                            }
                                        }
                                    }
                                }]
                            }
                        }]
                    }
                };

                if (data.ingressTls) {
                    ingress.spec.tls = [{
                        hosts: [data.ingressHost],
                        secretName: `${data.appName}-tls`
                    }];
                }

                manifests.push(ingress);
            }

            // Generate ConfigMap
            if (data.genConfigMap) {
                const configMap = {
                    apiVersion: 'v1',
                    kind: 'ConfigMap',
                    metadata: {
                        name: `${data.appName}-config`,
                        namespace: data.namespace,
                        labels: commonLabels
                    },
                    data: {
                        'example.key': 'example-value'
                    }
                };

                manifests.push(configMap);
            }

            // Generate Secret
            if (data.genSecret) {
                const secret = {
                    apiVersion: 'v1',
                    kind: 'Secret',
                    metadata: {
                        name: `${data.appName}-secret`,
                        namespace: data.namespace,
                        labels: commonLabels
                    },
                    type: 'Opaque',
                    data: {
                        'example-key': btoa('example-value')
                    }
                };

                manifests.push(secret);
            }

            // Generate HPA
            if (data.genHpa) {
                const hpa = {
                    apiVersion: 'autoscaling/v2',
                    kind: 'HorizontalPodAutoscaler',
                    metadata: {
                        name: data.appName,
                        namespace: data.namespace,
                        labels: commonLabels
                    },
                    spec: {
                        scaleTargetRef: {
                            apiVersion: 'apps/v1',
                            kind: 'Deployment',
                            name: data.appName
                        },
                        minReplicas: data.hpaMin,
                        maxReplicas: data.hpaMax,
                        metrics: [
                            {
                                type: 'Resource',
                                resource: {
                                    name: 'cpu',
                                    target: {
                                        type: 'Utilization',
                                        averageUtilization: data.hpaCpu
                                    }
                                }
                            },
                            {
                                type: 'Resource',
                                resource: {
                                    name: 'memory',
                                    target: {
                                        type: 'Utilization',
                                        averageUtilization: data.hpaMem
                                    }
                                }
                            }
                        ]
                    }
                };

                manifests.push(hpa);
            }

            // Generate YAML output
            const yamlOutput = YAML.stringifyAll(manifests);
            document.getElementById('yaml-output').innerHTML = `<code>${this.escapeHtml(yamlOutput)}</code>`;

            showToast('YAML gerado com sucesso!', 'success');
        },

        escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        },

        clearForm() {
            document.getElementById('gen-app-name').value = '';
            document.getElementById('gen-namespace').value = '';
            document.getElementById('gen-image').value = '';
            document.getElementById('gen-replicas').value = '2';
            document.getElementById('env-vars-container').innerHTML = '';
            document.getElementById('labels-container').innerHTML = '';
            document.getElementById('yaml-output').innerHTML = '<code>Preencha o formulário e clique em "Gerar YAML"</code>';
            this.envVarCount = 0;
            this.labelCount = 0;
        }
    };

    // ==========================================
    // Converter Module
    // ==========================================

    const Converter = {
        init() {
            this.bindEvents();
        },

        bindEvents() {
            const convertBtn = document.getElementById('convert-btn');
            if (convertBtn) {
                convertBtn.addEventListener('click', () => this.convert());
            }

            const swapBtn = document.getElementById('swap-formats');
            if (swapBtn) {
                swapBtn.addEventListener('click', () => this.swapFormats());
            }

            const copyBtn = document.getElementById('copy-converted');
            if (copyBtn) {
                copyBtn.addEventListener('click', () => {
                    const output = document.getElementById('converter-output').textContent;
                    copyToClipboard(output);
                });
            }

            const downloadBtn = document.getElementById('download-converted');
            if (downloadBtn) {
                downloadBtn.addEventListener('click', () => {
                    const output = document.getElementById('converter-output').textContent;
                    const format = document.getElementById('input-format').value === 'yaml' ? 'json' : 'yaml';
                    downloadFile(output, `converted.${format}`);
                });
            }

            // Auto-convert on input change (with debounce)
            const input = document.getElementById('converter-input');
            if (input) {
                let timeout;
                input.addEventListener('input', () => {
                    clearTimeout(timeout);
                    timeout = setTimeout(() => this.convert(), 500);
                });
            }
        },

        convert() {
            const input = document.getElementById('converter-input').value.trim();
            const inputFormat = document.getElementById('input-format').value;
            const outputEl = document.getElementById('converter-output');

            if (!input) {
                outputEl.innerHTML = '<code>O resultado aparecerá aqui...</code>';
                return;
            }

            try {
                let parsed, output;

                if (inputFormat === 'yaml') {
                    parsed = YAML.parse(input);
                    output = JSON.stringify(parsed, null, 2);
                } else {
                    parsed = JSON.parse(input);
                    output = YAML.stringify(parsed);
                }

                outputEl.innerHTML = `<code>${this.escapeHtml(output)}</code>`;
            } catch (e) {
                outputEl.innerHTML = `<code class="error">Erro: ${e.message}</code>`;
            }
        },

        swapFormats() {
            const inputFormat = document.getElementById('input-format');
            const inputEl = document.getElementById('converter-input');
            const outputEl = document.getElementById('converter-output');

            // Swap the format
            inputFormat.value = inputFormat.value === 'yaml' ? 'json' : 'yaml';

            // Move output to input
            const outputText = outputEl.textContent;
            if (outputText && !outputText.startsWith('Erro:') && !outputText.startsWith('O resultado')) {
                inputEl.value = outputText;
                this.convert();
            }
        },

        escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
    };

    // ==========================================
    // Base64 Module
    // ==========================================

    const Base64Module = {
        secretEntryCount: 1,

        init() {
            this.bindEvents();
        },

        bindEvents() {
            // Encode button
            const encodeBtn = document.getElementById('encode-base64');
            if (encodeBtn) {
                encodeBtn.addEventListener('click', () => this.encode());
            }

            // Decode button
            const decodeBtn = document.getElementById('decode-base64');
            if (decodeBtn) {
                decodeBtn.addEventListener('click', () => this.decode());
            }

            // Auto-encode on input
            const plainInput = document.getElementById('base64-plain');
            if (plainInput) {
                plainInput.addEventListener('input', () => this.encode());
            }

            // Add secret entry button
            const addSecretBtn = document.getElementById('add-secret-entry');
            if (addSecretBtn) {
                addSecretBtn.addEventListener('click', () => this.addSecretEntry());
            }

            // Generate secret button
            const genSecretBtn = document.getElementById('generate-secret');
            if (genSecretBtn) {
                genSecretBtn.addEventListener('click', () => this.generateSecret());
            }

            // Copy/Download secret buttons
            const copySecretBtn = document.getElementById('copy-secret');
            if (copySecretBtn) {
                copySecretBtn.addEventListener('click', () => {
                    const output = document.getElementById('secret-output').textContent;
                    copyToClipboard(output);
                });
            }

            const downloadSecretBtn = document.getElementById('download-secret');
            if (downloadSecretBtn) {
                downloadSecretBtn.addEventListener('click', () => {
                    const output = document.getElementById('secret-output').textContent;
                    const name = document.getElementById('secret-name').value || 'secret';
                    downloadFile(output, `${name}.yaml`);
                });
            }

            // Initialize remove buttons for existing entries
            this.initRemoveButtons();
        },

        initRemoveButtons() {
            document.querySelectorAll('.remove-secret-entry').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const entry = e.target.closest('.secret-entry');
                    if (document.querySelectorAll('.secret-entry').length > 1) {
                        entry.remove();
                    }
                });
            });
        },

        encode() {
            const plain = document.getElementById('base64-plain').value;
            try {
                const encoded = btoa(unescape(encodeURIComponent(plain)));
                document.getElementById('base64-encoded').value = encoded;
            } catch (e) {
                document.getElementById('base64-encoded').value = 'Erro ao encodar';
            }
        },

        decode() {
            const encoded = document.getElementById('base64-encoded').value.trim();
            try {
                const decoded = decodeURIComponent(escape(atob(encoded)));
                document.getElementById('base64-plain').value = decoded;
            } catch (e) {
                document.getElementById('base64-plain').value = 'Erro ao decodar (Base64 inválido?)';
            }
        },

        addSecretEntry() {
            const container = document.getElementById('secret-entries');
            this.secretEntryCount++;

            const entry = document.createElement('div');
            entry.className = 'secret-entry';
            entry.innerHTML = `
                <input type="text" placeholder="Key (ex: DB_PASSWORD)" class="secret-key">
                <input type="text" placeholder="Value (será encodado)" class="secret-value">
                <button class="btn btn-icon btn-danger remove-secret-entry" title="Remover">✕</button>
            `;

            entry.querySelector('.remove-secret-entry').addEventListener('click', () => {
                if (document.querySelectorAll('.secret-entry').length > 1) {
                    entry.remove();
                }
            });

            container.appendChild(entry);
        },

        generateSecret() {
            const name = document.getElementById('secret-name').value.trim() || 'my-secret';
            const namespace = document.getElementById('secret-namespace').value.trim() || 'default';

            const data = {};
            document.querySelectorAll('.secret-entry').forEach(entry => {
                const key = entry.querySelector('.secret-key').value.trim();
                const value = entry.querySelector('.secret-value').value;
                if (key) {
                    data[key] = btoa(unescape(encodeURIComponent(value)));
                }
            });

            if (Object.keys(data).length === 0) {
                showToast('Adicione pelo menos um campo ao Secret', 'error');
                return;
            }

            const secret = {
                apiVersion: 'v1',
                kind: 'Secret',
                metadata: {
                    name: name,
                    namespace: namespace
                },
                type: 'Opaque',
                data: data
            };

            const yamlOutput = YAML.stringify(secret);
            document.getElementById('secret-output').innerHTML = `<code>${this.escapeHtml(yamlOutput)}</code>`;
            showToast('Secret YAML gerado!', 'success');
        },

        escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
    };

    // ==========================================
    // Data Export/Import
    // ==========================================

    const DataManager = {
        init() {
            this.bindEvents();
        },

        bindEvents() {
            const exportBtn = document.getElementById('export-data');
            if (exportBtn) {
                exportBtn.addEventListener('click', () => this.exportData());
            }

            const importBtn = document.getElementById('import-data');
            const importFile = document.getElementById('import-file');

            if (importBtn && importFile) {
                importBtn.addEventListener('click', () => importFile.click());
                importFile.addEventListener('change', (e) => this.importData(e));
            }
        },

        exportData() {
            const exportObj = {
                version: '1.0',
                exportDate: new Date().toISOString(),
                state: appState
            };

            downloadFile(
                JSON.stringify(exportObj, null, 2),
                `devops-toolkit-backup-${new Date().toISOString().split('T')[0]}.json`,
                'application/json'
            );
        },

        importData(event) {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    if (data.version && data.state) {
                        appState = { ...appState, ...data.state };
                        saveState();
                        initTheme();
                        showToast('Dados importados com sucesso!', 'success');
                    } else {
                        showToast('Formato de arquivo inválido', 'error');
                    }
                } catch (err) {
                    showToast('Erro ao ler arquivo: ' + err.message, 'error');
                }
            };
            reader.readAsText(file);

            // Reset input
            event.target.value = '';
        }
    };

    // ==========================================
    // Initialization
    // ==========================================

    function init() {
        loadState();
        initTheme();
        initTabs();

        // Initialize modules
        Calculator.init();
        Generator.init();
        Converter.init();
        Base64Module.init();
        DataManager.init();

        // Theme toggle
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', toggleTheme);
        }

        // Listen for system theme changes
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            if (!localStorage.getItem(STORAGE_KEY)) {
                document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
            }
        });
    }

    // Run when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
