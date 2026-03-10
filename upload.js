// Check authentication
auth.onAuthStateChanged((user) => {
    if (!user) {
        window.location.href = 'login.html';
    } else {
        initializeDashboard(user);
    }
});

let currentUser = null;
let currentUserData = null;

async function initializeDashboard(user) {
    currentUser = user;

    // Display user name
    document.getElementById('userName').textContent = `Welcome, ${user.displayName || 'User'}`;

    // Load user data
    await loadUserData();

    // Load files
    await loadFiles();

    // Setup event listeners
    setupEventListeners();
}

async function loadUserData() {
    const userDoc = await db.collection('users').doc(currentUser.uid).get();
    currentUserData = userDoc.data();

    // Update storage display
    updateStorageDisplay();
}

function updateStorageDisplay() {
    const storageUsed = currentUserData.storageUsed || 0;
    const storageLimit = currentUserData.storageLimit || STORAGE_LIMIT;

    const usedGB = (storageUsed / (1024 * 1024 * 1024)).toFixed(2);
    const percentage = (storageUsed / storageLimit) * 100;

    document.getElementById('storageUsed').textContent = `${usedGB} GB`;
    document.getElementById('storageBar').style.width = `${percentage}%`;
}

async function loadFiles(filter = 'all') {
    const filesGrid = document.getElementById('filesGrid');
    const emptyState = document.getElementById('emptyState');

    // Clear existing files (except empty state)
    const fileCards = filesGrid.querySelectorAll('.file-card');
    fileCards.forEach(card => card.remove());

    // Build query
    let query = db.collection('media')
        .where('userId', '==', currentUser.uid)
        .orderBy('createdAt', 'desc');

    if (filter === 'image') {
        query = query.where('type', '==', 'image');
    } else if (filter === 'video') {
        query = query.where('type', '==', 'video');
    }

    const snapshot = await query.get();

    if (snapshot.empty) {
        emptyState.style.display = 'block';
        return;
    }

    emptyState.style.display = 'none';

    snapshot.forEach((doc) => {
        const data = doc.data();
        const fileCard = createFileCard(doc.id, data);
        filesGrid.appendChild(fileCard);
    });
}

function createFileCard(id, data) {
    const card = document.createElement('div');
    card.className = 'file-card';
    card.dataset.id = id;
    card.dataset.url = data.url;
    card.dataset.type = data.type;
    card.dataset.filename = data.filename;

    const sizeText = formatFileSize(data.size);

    if (data.type === 'image') {
        card.innerHTML = `
            <img src="${data.url}" alt="${data.filename}" class="file-thumbnail">
            <div class="file-info">
                <h4>${data.filename}</h4>
                <p>${sizeText}</p>
            </div>
        `;
    } else {
        card.innerHTML = `
            <div class="file-thumbnail video" style="display: flex; align-items: center; justify-content: center;">
                <i class="fas fa-play-circle" style="font-size: 3rem; color: var(--primary-color);"></i>
            </div>
            <div class="file-info">
                <h4>${data.filename}</h4>
                <p>${sizeText}</p>
            </div>
        `;
    }

    card.addEventListener('click', () => openPreview(data));

    return card;
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function setupEventListeners() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');

    // Click to upload
    uploadArea.addEventListener('click', () => fileInput.click());

    // File input change
    fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
    });

    // Drag and drop
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
        handleFiles(e.dataTransfer.files);
    });

    // Logout
    document.getElementById('logoutBtn').addEventListener('click', async () => {
        await auth.signOut();
        window.location.href = 'login.html';
    });

    // Sidebar navigation
    document.querySelectorAll('.sidebar-nav a').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.sidebar-nav a').forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            loadFiles(link.dataset.filter);
        });
    });

    // Modal close
    document.getElementById('modalClose').addEventListener('click', closePreview);

    // View toggle
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            // Toggle view (grid/list)
            const filesGrid = document.getElementById('filesGrid');
            if (btn.dataset.view === 'list') {
                filesGrid.style.gridTemplateColumns = '1fr';
            } else {
                filesGrid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(200px, 1fr))';
            }
        });
    });
}

async function handleFiles(files) {
    const uploadProgress = document.getElementById('uploadProgress');
    const progressFill = document.getElementById('progressFill');
    const uploadStatus = document.getElementById('uploadStatus');

    for (const file of files) {
        // Validate file type
        if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
            alert(`${file.name} is not a valid image or video file.`);
            continue;
        }

        // Check storage limit
        if (currentUserData.storageUsed + file.size > currentUserData.storageLimit) {
            alert('Storage limit exceeded! Please delete some files.');
            return;
        }

        uploadProgress.style.display = 'block';
        uploadStatus.textContent = `Uploading ${file.name}...`;

        try {
            // Create storage reference
            const storageRef = storage.ref(`users/${currentUser.uid}/${Date.now()}_${file.name}`);

            // Upload file
            const uploadTask = storageRef.put(file);

            // Monitor progress
            uploadTask.on('state_changed',
                (snapshot) => {
                    const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    progressFill.style.width = `${progress}%`;
                },
                (error) => {
                    console.error('Upload error:', error);
                    uploadStatus.textContent = 'Upload failed!';
                },
                async () => {
                    // Get download URL
                    const downloadURL = await uploadTask.snapshot.ref.getDownloadURL();

                    // Save to Firestore
                    await db.collection('media').add({
                        userId: currentUser.uid,
                        filename: file.name,
                        url: downloadURL,
                        size: file.size,
                        type: file.type.startsWith('image/') ? 'image' : 'video',
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });

                    // Update user storage
                    await db.collection('users').doc(currentUser.uid).update({
                        storageUsed: firebase.firestore.FieldValue.increment(file.size)
                    });

                    // Reload user data and files
                    await loadUserData();
                    await loadFiles();

                    uploadStatus.textContent = 'Upload complete!';
                    setTimeout(() => {
                        uploadProgress.style.display = 'none';
                        progressFill.style.width = '0%';
                    }, 2000);
                }
            );
        } catch (error) {
            console.error('Error:', error);
            uploadStatus.textContent = 'Upload failed!';
        }
    }
}

let currentPreviewFile = null;

function openPreview(data) {
    currentPreviewFile = data;
    const modal = document.getElementById('previewModal');
    const modalBody = document.getElementById('modalBody');

    if (data.type === 'image') {
        modalBody.innerHTML = `<img src="${data.url}" alt="${data.filename}">`;
    } else {
        modalBody.innerHTML = `<video src="${data.url}" controls autoplay></video>`;
    }

    modal.classList.add('active');

    // Download button
    document.getElementById('downloadBtn').onclick = () => {
        const a = document.createElement('a');
        a.href = data.url;
        a.download = data.filename;
        a.target = '_blank';
        a.click();
    };

    // Delete button
    document.getElementById('deleteBtn').onclick = () => deleteFile(data);
}

function closePreview() {
    document.getElementById('previewModal').classList.remove('active');
    document.getElementById('modalBody').innerHTML = '';
}

async function deleteFile(data) {
    if (!confirm('Are you sure you want to delete this file?')) return;

    try {
        // Delete from Firestore
        const snapshot = await db.collection('media')
            .where('userId', '==', currentUser.uid)
            .where('url', '==', data.url)
            .get();

        snapshot.forEach(async (doc) => {
            await doc.ref.delete();
        });

        // Update user storage
        await db.collection('users').doc(currentUser.uid).update({
            storageUsed: firebase.firestore.FieldValue.increment(-data.size)
        });

        // Delete from Storage (optional - requires parsing the storage path)
        // const storageRef = storage.refFromURL(data.url);
        // await storageRef.delete();

        closePreview();
        await loadUserData();
        await loadFiles();

    } catch (error) {
        console.error('Delete error:', error);
        alert('Failed to delete file.');
    }
}
