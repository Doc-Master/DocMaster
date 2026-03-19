        // ── DOM refs ──
        const uploadArea = document.getElementById('uploadArea');
        const fileInput = document.getElementById('fileInput');
        const uploadStatus = document.getElementById('uploadStatus');
        const documentList = document.getElementById('documentList');
        const resultsSection = document.getElementById('resultsSection');
        const settingsHeader = document.getElementById('settingsHeader');
        const settingsToggle = document.getElementById('settingsToggle');
        const settingsContent = document.getElementById('settingsContent');
        const filterTopKInput = document.getElementById('filterTopK');
        const ragTopKInput = document.getElementById('ragTopK');
        const resetSettingsBtn = document.getElementById('resetSettings');

        let refreshInterval = null;
        const DEFAULT_SETTINGS = { filterTopK: 10, ragTopK: 5 };

        // ── Init ──
        loadDocuments();
        loadQueryFromStorage();
        loadLastResults();
        loadSettings();
        startAutoRefresh();

        // ── Settings panel ──
        settingsHeader.addEventListener('click', () => {
            settingsContent.classList.toggle('show');
            settingsToggle.classList.toggle('open');
            settingsHeader.classList.toggle('open');
        });

        filterTopKInput.addEventListener('change', saveSettings);
        ragTopKInput.addEventListener('change', saveSettings);

        resetSettingsBtn.addEventListener('click', () => {
            filterTopKInput.value = DEFAULT_SETTINGS.filterTopK;
            ragTopKInput.value = DEFAULT_SETTINGS.ragTopK;
            saveSettings();
        });

        function saveSettings() {
            localStorage.setItem('semantic_filter_settings', JSON.stringify({
                filterTopK: parseInt(filterTopKInput.value),
                ragTopK: parseInt(ragTopKInput.value)
            }));
        }

        function loadSettings() {
            const s = localStorage.getItem('semantic_filter_settings');
            if (s) {
                try {
                    const p = JSON.parse(s);
                    filterTopKInput.value = p.filterTopK || DEFAULT_SETTINGS.filterTopK;
                    ragTopKInput.value = p.ragTopK || DEFAULT_SETTINGS.ragTopK;
                } catch(e) {}
            }
        }

        // ── Upload ──
        uploadArea.addEventListener('click', () => fileInput.click());

        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });

        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
        });

        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) handleFile(e.target.files[0]);
        });

        let currentDocuments = [];

        async function loadDocuments() {
            try {
                const res = await fetch('/api/documents');
                const data = await res.json();
                if (res.ok) {
                    const changed = JSON.stringify(currentDocuments) !== JSON.stringify(data.documents);
                    if (changed) {
                        currentDocuments = data.documents;
                        displayDocumentList(data.documents);
                    }
                } else {
                    documentList.innerHTML = '<div style="text-align:center;color:#9ca3af;padding:14px;font-size:0.88em;">No documents uploaded yet</div>';
                }
            } catch(e) { console.error(e); }
        }

        function startAutoRefresh() {
            setTimeout(() => document.getElementById('syncIndicator').classList.add('show'), 1000);
            refreshInterval = setInterval(loadDocuments, 5000);
        }

        function stopAutoRefresh() {
            if (refreshInterval) { clearInterval(refreshInterval); refreshInterval = null; }
            document.getElementById('syncIndicator').classList.remove('show');
        }

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) { stopAutoRefresh(); }
            else { loadDocuments(); startAutoRefresh(); }
        });

        function displayDocumentList(docs) {
            if (!docs || docs.length === 0) {
                documentList.innerHTML = '<div style="text-align:center;color:#9ca3af;padding:14px;font-size:0.88em;">No documents uploaded yet</div>';
                return;
            }
            documentList.innerHTML =
                '<div class="doc-list-label">Uploaded Documents</div>' +
                docs.map(d => `
                    <div class="document-item">
                        <span class="document-name">${d.filename}</span>
                        <span class="document-size">${formatFileSize(d.size)}</span>
                    </div>
                `).join('');
            updateTreeDocumentSelect(docs);
        }

        function updateTreeDocumentSelect(docs) {
            const sel = document.getElementById('treeDocumentSelect');
            const prev = sel.value;
            sel.innerHTML = '<option value="">Select a document to view its tree structure&hellip;</option>' +
                docs.map(d => `<option value="${d.filename}">${d.filename}</option>`).join('');
            if (prev && docs.some(d => d.filename === prev)) {
                sel.value = prev;
                document.getElementById('loadTreeBtn').disabled = false;
            }
        }

        function formatFileSize(bytes) {
            if (bytes < 1024) return bytes + ' B';
            if (bytes < 1048576) return (bytes/1024).toFixed(1) + ' KB';
            return (bytes/1048576).toFixed(1) + ' MB';
        }

        async function handleFile(file) {
            if (!file.name.endsWith('.pdf')) { showStatus('Only PDF files are supported.', 'error'); return; }
            const fd = new FormData();
            fd.append('file', file);
            showStatus('Processing document and building semantic index&hellip; <span class="loading"></span>', 'info');
            try {
                const res = await fetch('/api/upload', { method: 'POST', body: fd });
                const data = await res.json();
                if (res.ok) {
                    showStatus(`&#x2705; ${data.filename} uploaded and indexed successfully.`, 'success');
                    await loadDocuments();
                } else {
                    showStatus(`&#x274C; Error: ${data.error}`, 'error');
                }
            } catch(e) {
                showStatus(`&#x274C; Network error: ${e.message}`, 'error');
            }
        }

        function showStatus(msg, type) {
            uploadStatus.innerHTML = `<div class="status ${type}">${msg}</div>`;
        }

        // ── Persistence ──
        function loadLastResults() {
            const s = localStorage.getItem('semantic_filter_last_results');
            if (s) { try { displayResults(JSON.parse(s)); } catch(e) {} }
        }

        function saveQueryToStorage(q) { localStorage.setItem('semantic_filter_query', q); }

        function loadQueryFromStorage() {
            const q = localStorage.getItem('semantic_filter_query');
            if (q) document.getElementById('queryInput').value = q;
        }

        document.getElementById('queryInput').addEventListener('input', e => saveQueryToStorage(e.target.value));

        // ── Filter Progress Animation ──
        const filterOverlay = document.getElementById('filterProgressOverlay');
        const fpSteps = [
            document.getElementById('fpStep1'),
            document.getElementById('fpStep2'),
            document.getElementById('fpStep3')
        ];
        const fpBar = document.getElementById('filterProgressBar');

        function showFilterProgress() {
            // Reset
            fpSteps.forEach(s => {
                s.classList.remove('active', 'done');
                s.querySelector('.fp-step-status').innerHTML = '';
            });
            fpBar.style.width = '0%';
            filterOverlay.classList.add('show');

            // Step 1: Tree traversal
            setTimeout(() => {
                fpSteps[0].classList.add('active');
                fpSteps[0].querySelector('.fp-step-status').innerHTML = '<span class="loading loading-blue"></span>';
                fpBar.style.width = '15%';
            }, 100);

            // Step 2: Hyperedge search
            setTimeout(() => {
                fpSteps[0].classList.remove('active');
                fpSteps[0].classList.add('done');
                fpSteps[0].querySelector('.fp-step-status').innerHTML = '<span class="fp-step-check">&#x2713;</span>';
                fpSteps[1].classList.add('active');
                fpSteps[1].querySelector('.fp-step-status').innerHTML = '<span class="loading loading-blue"></span>';
                fpBar.style.width = '45%';
            }, 1500);

            // Step 3: Combining
            setTimeout(() => {
                fpSteps[1].classList.remove('active');
                fpSteps[1].classList.add('done');
                fpSteps[1].querySelector('.fp-step-status').innerHTML = '<span class="fp-step-check">&#x2713;</span>';
                fpSteps[2].classList.add('active');
                fpSteps[2].querySelector('.fp-step-status').innerHTML = '<span class="loading loading-blue"></span>';
                fpBar.style.width = '75%';
            }, 3000);
        }

        function hideFilterProgress() {
            fpSteps[2].classList.remove('active');
            fpSteps[2].classList.add('done');
            fpSteps[2].querySelector('.fp-step-status').innerHTML = '<span class="fp-step-check">&#x2713;</span>';
            fpBar.style.width = '100%';
            setTimeout(() => { filterOverlay.classList.remove('show'); }, 500);
        }

        // ── Filter ──
        document.getElementById('filterBtn').addEventListener('click', async () => {
            const condition = document.getElementById('queryInput').value.trim();
            if (!condition) { alert('Please enter a filter condition.'); return; }

            const btn = document.getElementById('filterBtn');
            btn.disabled = true;
            btn.innerHTML = 'Processing&hellip; <span class="loading"></span>';
            showFilterProgress();

            try {
                const res = await fetch('/api/filter', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        condition,
                        filter_top_k: parseInt(filterTopKInput.value),
                        rag_top_k: parseInt(ragTopKInput.value)
                    })
                });
                const data = await res.json();
                hideFilterProgress();
                if (res.ok) {
                    displayResults(data);
                    localStorage.setItem('semantic_filter_last_results', JSON.stringify(data));
                } else {
                    alert(`Error: ${data.error}`);
                }
            } catch(e) {
                hideFilterProgress();
                alert(`Network error: ${e.message}`);
            } finally {
                btn.disabled = false;
                btn.innerHTML = 'Filter All Documents';
            }
        });

        function displayResults(data) {
            resultsSection.classList.add('show');

            const treeCount = data.matched_documents.document_tree;
            const hyperCount = data.matched_documents.hyperedge_search;
            const combCount = data.matched_documents.combined;

            // Animate result cards with stagger
            const cards = ['docTreeCard', 'hyperedgeCard', 'combinedCard'];
            const values = [
                { id: 'docTreeValue', count: treeCount },
                { id: 'hyperedgeValue', count: hyperCount },
                { id: 'combinedValue', count: combCount }
            ];

            cards.forEach((cardId, i) => {
                setTimeout(() => {
                    setResultCard(cardId, values[i].id, values[i].count);
                    const card = document.getElementById(cardId);
                    card.classList.remove('animate-in');
                    void card.offsetWidth;
                    card.classList.add('animate-in');
                    // Count-up animation
                    animateCount(document.getElementById(values[i].id), values[i].count, 500);
                }, i * 150);
            });

            const filteredDocs = document.getElementById('filteredDocs');
            filteredDocs.innerHTML = data.results.map(doc => {
                if (doc.error) return `
                    <div class="doc-result">
                        <span class="doc-result-name">${doc.filename}</span>
                        <span style="color:var(--error);font-size:0.83em;">Error: ${doc.error}</span>
                    </div>`;
                return `
                    <div class="doc-result ${doc.combined ? 'matched' : ''}" style="opacity:0;">
                        <span class="doc-result-name">${doc.filename}</span>
                        <div class="doc-result-strategies">
                            <span class="strategy-badge ${doc.document_tree ? 'match' : 'no-match'}">Tree: ${doc.document_tree ? '&#x2713;' : '&#x2717;'}</span>
                            <span class="strategy-badge ${doc.hyperedge_search ? 'match' : 'no-match'}">Hyper: ${doc.hyperedge_search ? '&#x2713;' : '&#x2717;'}</span>
                            <span class="strategy-badge ${doc.combined ? 'match' : 'no-match'}">Combined: ${doc.combined ? '&#x2713;' : '&#x2717;'}</span>
                        </div>
                    </div>`;
            }).join('');

            // Stagger doc result animations
            filteredDocs.querySelectorAll('.doc-result').forEach((el, i) => {
                setTimeout(() => {
                    el.style.opacity = '';
                    el.classList.add('animate-in');
                }, 500 + i * 80);
            });

            document.getElementById('docTokens').textContent = data.total_tokens.document.toLocaleString();
            document.getElementById('hyperedgeTokens').textContent = data.total_tokens.hyperedge.toLocaleString();
            document.getElementById('combinedTokens').textContent = data.total_tokens.combined.toLocaleString();

            resultsSection.scrollIntoView({ behavior: 'smooth' });

            const matched = data.results.filter(r => r.combined).map(r => r.filename);
            if (matched.length > 0) showFilteredScopeOption(matched);
        }

        function animateCount(el, target, duration) {
            const startTime = performance.now();
            function update(currentTime) {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const eased = 1 - Math.pow(1 - progress, 3);
                el.textContent = Math.round(target * eased);
                if (progress < 1) requestAnimationFrame(update);
            }
            requestAnimationFrame(update);
        }

        function setResultCard(cardId, valueId, count) {
            const card = document.getElementById(cardId);
            const val = document.getElementById(valueId);
            val.textContent = count;
            card.classList.remove('match', 'no-match');
            card.classList.add(count > 0 ? 'match' : 'no-match');
        }

        // ── Tree viewer (SVG graph) ──
        const treeDocumentSelect = document.getElementById('treeDocumentSelect');
        const loadTreeBtn = document.getElementById('loadTreeBtn');
        const treeViewer = document.getElementById('treeViewer');
        let currentTreeData = null;

        const NODE_COLORS = {
            root: '#2563eb', title: '#7c3aed', text: '#059669',
            figure: '#d97706', table: '#b45309'
        };

        treeDocumentSelect.addEventListener('change', e => {
            loadTreeBtn.disabled = !e.target.value;
        });

        loadTreeBtn.addEventListener('click', async () => {
            const filename = treeDocumentSelect.value;
            if (!filename) return;
            loadTreeBtn.disabled = true;
            loadTreeBtn.innerHTML = 'Loading&hellip;';
            treeViewer.innerHTML = '';
            treeViewer.style.display = 'none';

            try {
                const res = await fetch(`/api/tree/${filename}`);
                const data = await res.json();
                if (res.ok) { currentTreeData = data; displayDocumentTree(data); }
                else { treeViewer.innerHTML = `<div class="tree-empty">Error: ${data.error}</div>`; treeViewer.style.display = 'block'; }
            } catch(e) {
                treeViewer.innerHTML = `<div class="tree-empty">Error: ${e.message}</div>`;
                treeViewer.style.display = 'block';
            } finally {
                loadTreeBtn.disabled = false;
                loadTreeBtn.innerHTML = 'Load Tree';
            }
        });

        function escapeHtml(text) {
            const d = document.createElement('div');
            d.textContent = text;
            return d.innerHTML;
        }

        // Build tree structure from flat node array
        function buildTreeStructure(nodes) {
            if (!nodes || nodes.length === 0) return null;
            const rootNodes = [];
            nodes.forEach(n => { n._children = []; });
            nodes.forEach((node, idx) => {
                if (node.depth === 0) { rootNodes.push(node); }
                else {
                    for (let i = idx - 1; i >= 0; i--) {
                        if (nodes[i].depth === node.depth - 1) {
                            nodes[i]._children.push(node);
                            break;
                        }
                    }
                }
            });
            // Use first root or wrap multiple roots
            if (rootNodes.length === 1) return rootNodes[0];
            return { id: '__virtual_root', type: 'root', depth: 0, content: 'Document', _children: rootNodes };
        }

        // Get visible children (respects _collapsed flag)
        function visibleChildren(node) {
            if (node._collapsed || !node._children) return [];
            return node._children;
        }

        // Layout algorithm: compute x,y for each node
        function computeTreeLayout(root, cfg) {
            const { nodeW, nodeH, hGap, vGap } = cfg;
            // Pass 1: compute subtree widths
            function subtreeWidth(node) {
                const kids = visibleChildren(node);
                if (kids.length === 0) {
                    node._sw = nodeW;
                    return node._sw;
                }
                let w = 0;
                kids.forEach(c => { w += subtreeWidth(c); });
                w += (kids.length - 1) * hGap;
                node._sw = Math.max(nodeW, w);
                return node._sw;
            }
            subtreeWidth(root);

            // Pass 2: assign positions
            function assign(node, x, y) {
                node._x = x + node._sw / 2;
                node._y = y;
                const kids = visibleChildren(node);
                if (kids.length > 0) {
                    let cx = x;
                    kids.forEach(c => {
                        assign(c, cx, y + nodeH + vGap);
                        cx += c._sw + hGap;
                    });
                }
            }
            assign(root, 0, 0);

            return { width: root._sw + nodeW, height: getMaxDepth(root) * (nodeH + vGap) + nodeH };
        }

        function getMaxDepth(node) {
            const kids = visibleChildren(node);
            if (kids.length === 0) return 0;
            return 1 + Math.max(...kids.map(getMaxDepth));
        }

        // Collect visible nodes into flat list
        function collectNodes(node, list) {
            list.push(node);
            visibleChildren(node).forEach(c => collectNodes(c, list));
            return list;
        }

        // Render SVG tree into a container. Returns a redraw function.
        function renderTreeSVG(root, container, cfg, isModal) {
            const { nodeW, nodeH } = cfg;
            const pad = 20;

            const wrapper = document.createElement('div');
            wrapper.className = 'tree-svg-wrapper' + (isModal ? ' tree-svg-modal' : '');

            function draw() {
                // Remove old SVG
                const oldSvg = wrapper.querySelector('svg');
                if (oldSvg) oldSvg.remove();
                // Remove old detail popup
                const oldPopup = container.querySelector('.tree-detail-popup');
                if (oldPopup) oldPopup.remove();

                const layout = computeTreeLayout(root, cfg);
                const svgW = layout.width + pad * 2;
                const svgH = layout.height + pad * 2;

                const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                svg.setAttribute('viewBox', `0 0 ${svgW} ${svgH}`);
                svg.setAttribute('width', svgW);
                svg.setAttribute('height', svgH);
                svg.classList.add('tree-svg');

                const allNodes = collectNodes(root, []);

                // Draw edges
                const edgesG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                allNodes.forEach(node => {
                    visibleChildren(node).forEach(child => {
                        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                        const x1 = node._x + pad, y1 = node._y + nodeH + pad;
                        const x2 = child._x + pad, y2 = child._y + pad;
                        const my = (y1 + y2) / 2;
                        path.setAttribute('d', `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`);
                        path.setAttribute('fill', 'none');
                        path.setAttribute('stroke', '#cbd5e1');
                        path.setAttribute('stroke-width', '2');
                        edgesG.appendChild(path);
                    });
                });
                svg.appendChild(edgesG);

                // Draw nodes
                const nodesG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                allNodes.forEach(node => {
                    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                    g.setAttribute('transform', `translate(${node._x - nodeW / 2 + pad}, ${node._y + pad})`);
                    g.style.cursor = 'pointer';

                    const color = NODE_COLORS[node.type] || '#64748b';
                    const hasKids = node._children && node._children.length > 0;
                    const isCollapsed = hasKids && node._collapsed;

                    // Node rect
                    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                    rect.setAttribute('width', nodeW);
                    rect.setAttribute('height', nodeH);
                    rect.setAttribute('rx', '8');
                    rect.setAttribute('fill', isCollapsed ? '#f8fafc' : 'white');
                    rect.setAttribute('stroke', color);
                    rect.setAttribute('stroke-width', '2');
                    if (isCollapsed) rect.setAttribute('stroke-dasharray', '6 3');
                    g.appendChild(rect);

                    // Color bar at top
                    const bar = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                    bar.setAttribute('width', nodeW);
                    bar.setAttribute('height', '4');
                    bar.setAttribute('rx', '2');
                    bar.setAttribute('fill', color);
                    g.appendChild(bar);

                    // Type label
                    const typeText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                    typeText.setAttribute('x', nodeW / 2);
                    typeText.setAttribute('y', '18');
                    typeText.setAttribute('text-anchor', 'middle');
                    typeText.setAttribute('font-size', isModal ? '12' : '10');
                    typeText.setAttribute('font-weight', '700');
                    typeText.setAttribute('fill', color);
                    typeText.textContent = (node.type || 'node').toUpperCase();
                    g.appendChild(typeText);

                    // Preview text
                    let preview = '';
                    if (node.content) preview = node.content.length > 30 ? node.content.substring(0, 30) + '...' : node.content;
                    else if (node.filename) preview = node.filename;
                    if (preview) {
                        const prevText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                        prevText.setAttribute('x', nodeW / 2);
                        prevText.setAttribute('y', '32');
                        prevText.setAttribute('text-anchor', 'middle');
                        prevText.setAttribute('font-size', isModal ? '10' : '8');
                        prevText.setAttribute('fill', '#64748b');
                        prevText.textContent = preview;
                        g.appendChild(prevText);
                    }

                    // Collapse/expand toggle button (bottom center of node)
                    if (hasKids) {
                        const toggleG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                        toggleG.setAttribute('transform', `translate(${nodeW / 2}, ${nodeH})`);
                        toggleG.style.cursor = 'pointer';

                        const toggleBg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                        toggleBg.setAttribute('r', '10');
                        toggleBg.setAttribute('fill', 'white');
                        toggleBg.setAttribute('stroke', color);
                        toggleBg.setAttribute('stroke-width', '1.5');
                        toggleG.appendChild(toggleBg);

                        const toggleText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                        toggleText.setAttribute('text-anchor', 'middle');
                        toggleText.setAttribute('y', '4');
                        toggleText.setAttribute('font-size', '12');
                        toggleText.setAttribute('font-weight', '700');
                        toggleText.setAttribute('fill', color);
                        toggleText.textContent = isCollapsed ? '+' : '\u2212';
                        toggleG.appendChild(toggleText);

                        // Count label
                        const countText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                        countText.setAttribute('text-anchor', 'middle');
                        countText.setAttribute('y', '22');
                        countText.setAttribute('font-size', '8');
                        countText.setAttribute('font-weight', '600');
                        countText.setAttribute('fill', '#94a3b8');
                        countText.textContent = node._children.length;
                        toggleG.appendChild(countText);

                        toggleG.addEventListener('click', (e) => {
                            e.stopPropagation();
                            node._collapsed = !node._collapsed;
                            draw();
                        });

                        toggleG.addEventListener('mouseenter', () => {
                            toggleBg.setAttribute('fill', color);
                            toggleText.setAttribute('fill', 'white');
                        });
                        toggleG.addEventListener('mouseleave', () => {
                            toggleBg.setAttribute('fill', 'white');
                            toggleText.setAttribute('fill', color);
                        });

                        g.appendChild(toggleG);
                    }

                    // Click handler for details
                    g.addEventListener('click', (e) => {
                        e.stopPropagation();
                        showNodeDetail(node, container, wrapper);
                    });

                    // Hover effect
                    g.addEventListener('mouseenter', () => {
                        rect.setAttribute('stroke-width', '3');
                        rect.setAttribute('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.15))');
                    });
                    g.addEventListener('mouseleave', () => {
                        rect.setAttribute('stroke-width', '2');
                        rect.removeAttribute('filter');
                    });

                    nodesG.appendChild(g);
                });
                svg.appendChild(nodesG);

                // Click background to dismiss detail
                svg.addEventListener('click', () => {
                    const existing = container.querySelector('.tree-detail-popup');
                    if (existing) existing.remove();
                });

                wrapper.appendChild(svg);
            }

            draw();
            container.appendChild(wrapper);
            return { wrapper, redraw: draw };
        }

        // Show node detail popup
        function showNodeDetail(node, container, wrapper) {
            // Remove existing
            const existing = container.querySelector('.tree-detail-popup');
            if (existing) existing.remove();

            const popup = document.createElement('div');
            popup.className = 'tree-detail-popup';

            let html = `<div class="tree-detail-close">&times;</div>`;
            html += `<div class="tree-detail-type" style="color:${NODE_COLORS[node.type] || '#64748b'}">${(node.type || 'node').toUpperCase()}</div>`;
            if (node.content) html += `<div class="tree-detail-section"><div class="tree-detail-label">Content</div><div class="tree-detail-text">${escapeHtml(node.content)}</div></div>`;
            if (node.summary && node.summary !== 'Summary not generated') html += `<div class="tree-detail-section"><div class="tree-detail-label">Summary</div><div class="tree-detail-text" style="font-style:italic;color:#475569;">${escapeHtml(node.summary)}</div></div>`;
            html += `<div class="tree-detail-meta">`;
            if (node.depth !== undefined) html += `<span class="tree-detail-tag">Depth: ${node.depth}</span>`;
            if (node.children_count !== undefined) html += `<span class="tree-detail-tag">Children: ${node.children_count}</span>`;
            if (node.title_level !== undefined) html += `<span class="tree-detail-tag">Level: ${node.title_level}</span>`;
            if (node.filename) html += `<span class="tree-detail-tag">${escapeHtml(node.filename)}</span>`;
            html += `</div>`;

            popup.innerHTML = html;
            container.appendChild(popup);

            popup.querySelector('.tree-detail-close').addEventListener('click', (e) => {
                e.stopPropagation();
                popup.remove();
            });
        }

        // Display tree with SVG graph
        function displayDocumentTree(treeData) {
            treeViewer.style.display = 'block';
            treeViewer.innerHTML = '';

            // Stats bar + View button
            const statsBar = document.createElement('div');
            statsBar.className = 'tree-stats';
            statsBar.innerHTML = `
                <span><strong>File:</strong> ${treeData.meta_dict.file_name}</span>
                <span><strong>Nodes:</strong> ${treeData.nodes_count}</span>
                <button class="tree-view-btn" id="treeViewBtn" title="View full screen">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
                    View
                </button>
            `;
            treeViewer.appendChild(statsBar);

            const root = buildTreeStructure(treeData.tree_structure);
            if (!root) {
                treeViewer.innerHTML += '<div class="tree-empty">No tree structure available</div>';
                return;
            }

            const cfg = { nodeW: 120, nodeH: 40, hGap: 16, vGap: 50 };
            renderTreeSVG(root, treeViewer, cfg, false);

            // View button opens modal
            document.getElementById('treeViewBtn').addEventListener('click', () => {
                openTreeModal(treeData);
            });
        }

        // Full-screen modal with zoom/pan and collapse controls
        function openTreeModal(treeData) {
            const old = document.getElementById('treeModal');
            if (old) old.remove();

            const modal = document.createElement('div');
            modal.id = 'treeModal';
            modal.className = 'tree-modal-overlay';
            modal.innerHTML = `
                <div class="tree-modal">
                    <div class="tree-modal-header">
                        <h3>Document Tree — ${escapeHtml(treeData.meta_dict.file_name)}</h3>
                        <div class="tree-modal-toolbar">
                            <div class="tree-toolbar-group">
                                <button class="tree-toolbar-btn" id="tmZoomIn" title="Zoom in">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
                                </button>
                                <span class="tree-zoom-label" id="tmZoomLabel">100%</span>
                                <button class="tree-toolbar-btn" id="tmZoomOut" title="Zoom out">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
                                </button>
                                <button class="tree-toolbar-btn" id="tmZoomReset" title="Reset zoom">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                                </button>
                            </div>
                            <div class="tree-toolbar-divider"></div>
                            <div class="tree-toolbar-group">
                                <button class="tree-toolbar-btn" id="tmExpandAll" title="Expand all">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
                                    Expand
                                </button>
                                <button class="tree-toolbar-btn" id="tmCollapseAll" title="Collapse all">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 15l-6-6-6 6"/></svg>
                                    Collapse
                                </button>
                            </div>
                        </div>
                        <button class="tree-modal-close">&times;</button>
                    </div>
                    <div class="tree-modal-body"></div>
                </div>
            `;
            document.body.appendChild(modal);

            // Rebuild tree
            const freshNodes = JSON.parse(JSON.stringify(treeData.tree_structure));
            const root = buildTreeStructure(freshNodes);
            const body = modal.querySelector('.tree-modal-body');
            let treeResult = null;

            if (root) {
                const cfg = { nodeW: 160, nodeH: 48, hGap: 24, vGap: 70 };
                treeResult = renderTreeSVG(root, body, cfg, true);
            }

            // Zoom/pan state
            let scale = 1;
            const SCALE_STEP = 0.15;
            const MIN_SCALE = 0.2;
            const MAX_SCALE = 3;
            const zoomLabel = modal.querySelector('#tmZoomLabel');

            function applyZoom() {
                if (!treeResult) return;
                const svg = treeResult.wrapper.querySelector('svg');
                if (svg) {
                    svg.style.transform = `scale(${scale})`;
                    svg.style.transformOrigin = 'top left';
                }
                zoomLabel.textContent = Math.round(scale * 100) + '%';
            }

            modal.querySelector('#tmZoomIn').addEventListener('click', () => {
                scale = Math.min(MAX_SCALE, scale + SCALE_STEP);
                applyZoom();
            });
            modal.querySelector('#tmZoomOut').addEventListener('click', () => {
                scale = Math.max(MIN_SCALE, scale - SCALE_STEP);
                applyZoom();
            });
            modal.querySelector('#tmZoomReset').addEventListener('click', () => {
                scale = 1;
                applyZoom();
                scrollToRoot();
            });

            // Scroll view so root node is visible at top center
            function scrollToRoot() {
                if (!treeResult || !root) return;
                const svg = treeResult.wrapper.querySelector('svg');
                if (!svg) return;
                // Root node _x is its center; scroll so it's centered horizontally, near top vertically
                const rootCenterX = root._x * scale;
                const bodyW = body.clientWidth;
                body.scrollLeft = Math.max(0, rootCenterX - bodyW / 2);
                body.scrollTop = 0;
            }

            // Set initial view at root after render
            requestAnimationFrame(() => scrollToRoot());

            // Expand / Collapse all
            function setCollapseAll(node, collapsed) {
                if (node._children && node._children.length > 0) {
                    node._collapsed = collapsed;
                    node._children.forEach(c => setCollapseAll(c, collapsed));
                }
            }

            modal.querySelector('#tmExpandAll').addEventListener('click', () => {
                if (root) { setCollapseAll(root, false); if (treeResult) treeResult.redraw(); applyZoom(); scrollToRoot(); }
            });
            modal.querySelector('#tmCollapseAll').addEventListener('click', () => {
                if (root) {
                    root._collapsed = false;
                    if (root._children) root._children.forEach(c => setCollapseAll(c, true));
                    if (treeResult) treeResult.redraw();
                    applyZoom();
                    scrollToRoot();
                }
            });

            // Close handlers
            modal.querySelector('.tree-modal-close').addEventListener('click', () => modal.remove());
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.remove();
            });
            // Escape key
            const escHandler = (e) => {
                if (e.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', escHandler); }
            };
            document.addEventListener('keydown', escHandler);

            requestAnimationFrame(() => modal.classList.add('active'));
        }

        // ── RAG Chat ──
        let chatHistory = [];
        let chatScope = 'all';
        let filteredDocuments = [];

        const chatInput = document.getElementById('chatInput');
        const chatSendBtn = document.getElementById('chatSendBtn');
        const chatMessages = document.getElementById('chatMessages');
        const chatEmpty = document.getElementById('chatEmpty');
        const chatClearBtn = document.getElementById('chatClearBtn');
        const chatScopeOptions = document.getElementById('chatScopeOptions');
        const filteredScopeChip = document.getElementById('filteredScopeChip');

        chatInput.addEventListener('input', () => {
            chatInput.style.height = 'auto';
            chatInput.style.height = Math.min(chatInput.scrollHeight, 110) + 'px';
        });

        chatInput.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
        });

        chatSendBtn.addEventListener('click', sendChatMessage);

        chatClearBtn.addEventListener('click', () => {
            chatHistory = [];
            chatMessages.innerHTML = '';
            chatMessages.appendChild(chatEmpty);
            chatEmpty.style.display = 'flex';
        });

        chatScopeOptions.addEventListener('click', e => {
            const chip = e.target.closest('.scope-chip');
            if (!chip) return;
            document.querySelectorAll('.scope-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            chatScope = chip.dataset.scope;
        });

        function showFilteredScopeOption(docNames) {
            filteredDocuments = docNames;
            filteredScopeChip.style.display = '';
        }

        function appendChatMessage(role, content, sources) {
            chatEmpty.style.display = 'none';
            const msgEl = document.createElement('div');
            msgEl.className = `chat-message ${role}`;

            const avatarEl = document.createElement('div');
            avatarEl.className = 'chat-avatar';
            avatarEl.textContent = role === 'user' ? 'U' : 'AI';

            const bubbleEl = document.createElement('div');
            bubbleEl.className = 'chat-bubble';
            const textEl = document.createElement('div');
            textEl.textContent = content;
            bubbleEl.appendChild(textEl);

            if (sources && sources.length > 0) {
                const sourcesEl = document.createElement('div');
                sourcesEl.className = 'chat-sources';
                const titleEl = document.createElement('div');
                titleEl.className = 'chat-sources-title';
                titleEl.textContent = 'Sources';
                sourcesEl.appendChild(titleEl);
                sources.forEach(src => {
                    const srcItem = document.createElement('div');
                    srcItem.className = 'chat-source-item';
                    srcItem.innerHTML = `<div class="chat-source-filename">${escapeHtml(src.filename)}</div><div class="chat-source-excerpt">${escapeHtml(src.content)}&hellip;</div>`;
                    sourcesEl.appendChild(srcItem);
                });
                bubbleEl.appendChild(sourcesEl);
            }

            msgEl.appendChild(avatarEl);
            msgEl.appendChild(bubbleEl);
            chatMessages.appendChild(msgEl);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }

        function appendThinkingIndicator() {
            const msgEl = document.createElement('div');
            msgEl.className = 'chat-message assistant';
            msgEl.id = 'chat-thinking';
            const avatarEl = document.createElement('div');
            avatarEl.className = 'chat-avatar';
            avatarEl.textContent = 'AI';
            const bubbleEl = document.createElement('div');
            bubbleEl.className = 'chat-bubble';
            bubbleEl.innerHTML = '<div class="chat-thinking"><span></span><span></span><span></span></div>';
            msgEl.appendChild(avatarEl);
            msgEl.appendChild(bubbleEl);
            chatMessages.appendChild(msgEl);
            chatEmpty.style.display = 'none';
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }

        async function sendChatMessage() {
            const question = chatInput.value.trim();
            if (!question) return;
            chatSendBtn.disabled = true;
            chatInput.value = '';
            chatInput.style.height = 'auto';
            appendChatMessage('user', question);
            appendThinkingIndicator();
            try {
                const payload = { question, top_k: parseInt(ragTopKInput.value) || 5 };
                if (chatScope === 'filtered' && filteredDocuments.length > 0) payload.documents = filteredDocuments;
                const res = await fetch('/api/rag/query', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const thinkingEl = document.getElementById('chat-thinking');
                if (thinkingEl) thinkingEl.remove();
                const data = await res.json();
                if (res.ok) {
                    appendChatMessage('assistant', data.answer, data.sources);
                    chatHistory.push({ question, answer: data.answer });
                } else {
                    appendChatMessage('assistant', `Error: ${data.error || 'Unknown error'}`, null);
                }
            } catch(err) {
                const thinkingEl = document.getElementById('chat-thinking');
                if (thinkingEl) thinkingEl.remove();
                appendChatMessage('assistant', `Network error: ${err.message}`, null);
            } finally {
                chatSendBtn.disabled = false;
                chatInput.focus();
            }
        }
