document.addEventListener('DOMContentLoaded', function () {
    const userForms = document.querySelectorAll('[id^="userEditForm-"]');

    userForms.forEach(form => {
        form.addEventListener('submit', handleUserEditFormSubmit);
    });

    function handleUserEditFormSubmit(event) {
        event.preventDefault();

        const form = event.target;
        const userId = form.getAttribute('data-user-id');
        const saveButton = document.querySelector('button[type="submit"]');
        
        if (!saveButton) {
            console.error('Save button not found in form');
            return;
        }

        const originalButtonText = saveButton.textContent;
        saveButton.textContent = 'Saving...';
        saveButton.disabled = true;

        const formData = new FormData(form);
        const userData = {};
        formData.forEach((value, key) => {
            userData[key] = value;
        });

        // Get the endpoint from the form's data attribute
        const isManager = form.hasAttribute('data-manager');
        const endpoint = isManager ? `/manager/users/${userId}` : `/admin/users/${userId}`;

        fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]').content
            },
            body: JSON.stringify(userData)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to save user');
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                updateUserRow(userId, data.user);
                toggleEditMode(userId, false);
                showMessage('User Updated!', 'success');
            } else {
                showMessage(data.message || 'Error updating user', 'error');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showMessage('Error updating user', 'error');
        })
        .finally(() => {
            saveButton.textContent = originalButtonText;
            saveButton.disabled = false;
        });
    }

    function updateUserRow(userId, user) {
        const displayRow = document.querySelector(`tr[data-user-id="${userId}"], tr.displayRow[data-user-id="${userId}"]`);
        if (!displayRow) {
            console.error(`Display row not found for update - user ID: ${userId}`);
            return;
        }
        
        const elements = {
            firstName: displayRow.querySelector('.firstName'),
            lastName: displayRow.querySelector('.lastName'),
            email: displayRow.querySelector('.email'),
            role: displayRow.querySelector('.role')
        };

        // Check if all required elements exist
        for (const [key, element] of Object.entries(elements)) {
            if (!element) {
                console.error(`${key} element not found for user ID: ${userId}`);
                return;
            }
        }

        elements.firstName.textContent = user.first_name;
        elements.lastName.textContent = user.last_name;
        elements.email.textContent = user.email;
        elements.role.textContent = user.role;
    }

    function toggleEditMode(userId, isEdit) {
        // Try multiple selector patterns to find the display row
        const displayRow = document.querySelector(`
            tr[data-user-id="${userId}"],
            tr.displayRow[data-user-id="${userId}"],
            tr td[data-user-id="${userId}"]
        `);

        if (!displayRow) {
            console.error(`Display row not found for user ID: ${userId}`);
            return;
        }

        // Get the actual row element, whether it's the tr itself or its parent
        const parentRow = displayRow.tagName === 'TR' ? displayRow : displayRow.closest('tr');
        if (!parentRow) {
            console.error(`Parent row not found for user ID: ${userId}`);
            return;
        }

        const editRow = document.getElementById(`editUserRow-${userId}`);
        if (!editRow) {
            console.error(`Edit row not found for user ID: ${userId}`);
            return;
        }

        if (isEdit) {
            parentRow.style.display = 'none';
            editRow.style.display = '';
        } else {
            parentRow.style.display = '';
            editRow.style.display = 'none';
        }
    }

    function showMessage(message, type) {
        let messageContainer = document.getElementById('message-container');
        
        if (!messageContainer) {
            messageContainer = document.createElement('div');
            messageContainer.id = 'message-container';
            // Look for either container class
            const container = document.querySelector('.tableContainer') || document.querySelector('.viewUsersContainer');
            container.prepend(messageContainer);
        }
        
        const messageElement = document.createElement('div');
        messageElement.className = `alert alert-${type}`;
        messageElement.textContent = message;
        
        messageContainer.innerHTML = '';
        messageContainer.appendChild(messageElement);
        
        setTimeout(() => {
            messageElement.remove();
        }, 5000);
    }

    // Initialize edit buttons
    const editButtons = document.querySelectorAll('.editButton');
    editButtons.forEach(button => {
        button.addEventListener('click', function() {
            const userId = this.getAttribute('data-user-id');
            toggleEditMode(userId, true);
        });
    });

    // Initialize cancel buttons
    const cancelButtons = document.querySelectorAll('.cancelButton');
    cancelButtons.forEach(button => {
        button.addEventListener('click', function() {
            const userId = this.getAttribute('data-user-id');
            toggleEditMode(userId, false);
        });
    });
});
