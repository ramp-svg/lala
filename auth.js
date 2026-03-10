// Check if user is already logged in
auth.onAuthStateChanged((user) => {
    if (user) {
        // If on login or register page, redirect to dashboard
        if (window.location.pathname.includes('login.html') || 
            window.location.pathname.includes('register.html')) {
            window.location.href = 'dashboard.html';
        }
    }
});

// Registration
const registerForm = document.getElementById('registerForm');
if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const fullName = document.getElementById('fullName').value;
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;

        const errorMessage = document.getElementById('errorMessage');
        const successMessage = document.getElementById('successMessage');

        // Reset messages
        errorMessage.style.display = 'none';
        successMessage.style.display = 'none';

        // Validate passwords match
        if (password !== confirmPassword) {
            errorMessage.textContent = 'Passwords do not match!';
            errorMessage.style.display = 'block';
            return;
        }

        try {
            // Create user with Firebase Auth
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;

            // Update display name
            await user.updateProfile({
                displayName: fullName
            });

            // Create user document in Firestore
            await db.collection('users').doc(user.uid).set({
                fullName: fullName,
                email: email,
                storageUsed: 0,
                storageLimit: STORAGE_LIMIT,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            successMessage.textContent = 'Account created successfully! Redirecting...';
            successMessage.style.display = 'block';

            // Redirect to dashboard
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 1500);

        } catch (error) {
            errorMessage.textContent = getErrorMessage(error.code);
            errorMessage.style.display = 'block';
        }
    });
}

// Login
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const errorMessage = document.getElementById('errorMessage');

        errorMessage.style.display = 'none';

        try {
            await auth.signInWithEmailAndPassword(email, password);
            window.location.href = 'dashboard.html';
        } catch (error) {
            errorMessage.textContent = getErrorMessage(error.code);
            errorMessage.style.display = 'block';
        }
    });
}

// Google Login
const googleLoginBtn = document.getElementById('googleLogin');
if (googleLoginBtn) {
    googleLoginBtn.addEventListener('click', async () => {
        const provider = new firebase.auth.GoogleAuthProvider();

        try {
            const result = await auth.signInWithPopup(provider);
            const user = result.user;

            // Check if user document exists
            const userDoc = await db.collection('users').doc(user.uid).get();

            if (!userDoc.exists) {
                // Create user document for new Google users
                await db.collection('users').doc(user.uid).set({
                    fullName: user.displayName,
                    email: user.email,
                    storageUsed: 0,
                    storageLimit: STORAGE_LIMIT,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }

            window.location.href = 'dashboard.html';
        } catch (error) {
            const errorMessage = document.getElementById('errorMessage');
            errorMessage.textContent = getErrorMessage(error.code);
            errorMessage.style.display = 'block';
        }
    });
}

// Error message helper
function getErrorMessage(errorCode) {
    switch (errorCode) {
        case 'auth/email-already-in-use':
            return 'This email is already registered.';
        case 'auth/invalid-email':
            return 'Please enter a valid email address.';
        case 'auth/weak-password':
            return 'Password should be at least 6 characters.';
        case 'auth/user-not-found':
            return 'No account found with this email.';
        case 'auth/wrong-password':
            return 'Incorrect password. Please try again.';
        case 'auth/too-many-requests':
            return 'Too many attempts. Please try again later.';
        default:
            return 'An error occurred. Please try again.';
    }
}
