const fs = require('fs').promises;
const bcrypt = require('bcryptjs');
const path = require('path');

const USERS_FILE = path.join(__dirname, 'data', 'users.json');

async function updatePasswords() {
  try {
    // Read current users
    const usersData = await fs.readFile(USERS_FILE, 'utf8');
    const users = JSON.parse(usersData);
    
    console.log('Current users found:', users.length);
    
    // Update each user's password
    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const username = user.username.toLowerCase();
      const newPassword = username + '123456';
      
      // Hash the new password
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(newPassword, saltRounds);
      
      // Update the user's password
      users[i].passwordHash = passwordHash;
      
      console.log(`Updated password for ${user.username} (${user.email}): ${newPassword}`);
    }
    
    // Write back to file
    await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
    
    console.log('\n✅ All passwords updated successfully!');
    console.log('\nNew passwords:');
    users.forEach(user => {
      const username = user.username.toLowerCase();
      console.log(`${user.username} (${user.email}): ${username}123456`);
    });
    
  } catch (error) {
    console.error('Error updating passwords:', error);
  }
}

// Run the update
updatePasswords(); 