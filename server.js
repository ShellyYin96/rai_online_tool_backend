// Example backend server for handling case study submissions
// This is a demonstration - you would integrate this with your actual backend

const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Always use an absolute path for file-based storage (project-root/rai-values-react/data/case-studies.json)
const SUBMISSIONS_FILE = path.join(__dirname, 'data', 'case-studies.json');
const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const FOCUS_GROUP_FILE = path.join(__dirname, 'data', 'case-studies-focus-group.json');


// Ensure data directory exists
async function ensureDataDir() {
  try {
    await fs.mkdir(path.join(__dirname, 'data'), { recursive: true });
  } catch (error) {
    console.log('Data directory already exists');
  }
}

// Load existing submissions
async function loadSubmissions() {
  try {
    const data = await fs.readFile(SUBMISSIONS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
}

// Save submissions
async function saveSubmissions(submissions) {
  await fs.writeFile(SUBMISSIONS_FILE, JSON.stringify(submissions, null, 2));
}

// Load users
async function loadUsers() {
  try {
    const data = await fs.readFile(USERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
}

// Save users
async function saveUsers(users) {
  await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
}

async function loadFocusGroupSubmissions() {
  try {
    const data = await fs.readFile(FOCUS_GROUP_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
}

async function saveFocusGroupSubmissions(submissions) {
  await fs.writeFile(FOCUS_GROUP_FILE, JSON.stringify(submissions, null, 2));
}



// API Routes

// GET /api/case-studies - Get all submissions or filter by user
app.get('/api/case-studies', async (req, res) => {
  try {
    const submissions = await loadSubmissions();
    const { user } = req.query;
    let filtered = submissions;
    if (user) {
      filtered = submissions.filter(s => s.author && s.author === user);
    }
    res.json({
      success: true,
      data: filtered,
      count: filtered.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to load submissions'
    });
  }
});

// POST /api/case-studies - Submit new case study
app.post('/api/case-studies', async (req, res) => {
  try {
    const submission = req.body;
    console.log('Received submission:', submission); // Debug log
    // Only require title and author for now
    const requiredFields = ['title', 'author'];
    const missingFields = requiredFields.filter(field => !submission[field]);
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Missing required fields: ${missingFields.join(', ')}`
      });
    }
    // Add metadata
    const newSubmission = {
      ...submission, // This will include group if present
      id: Date.now().toString(),
      submittedAt: submission.submittedAt || new Date().toISOString(),
      status: 'pending', // Always set to pending
      reviewed: false
    };
    const submissions = await loadSubmissions();
    submissions.push(newSubmission);
    await saveSubmissions(submissions);
    res.status(201).json({
      success: true,
      message: 'Case study submitted successfully',
      data: newSubmission
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to submit case study'
    });
  }
});

// PUT /api/case-studies/:id - Update all fields of a submission (only if status is 'pending')
app.put('/api/case-studies/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateFields = req.body;
    const submissions = await loadSubmissions();
    const submissionIndex = submissions.findIndex(s => s.id === id);
    if (submissionIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Submission not found'
      });
    }
    // Only allow update if status is 'pending'
    if (submissions[submissionIndex].status !== 'pending') {
      return res.status(403).json({
        success: false,
        error: 'Cannot edit an approved submission'
      });
    }
    // Update all fields except id and submittedAt
    submissions[submissionIndex] = {
      ...submissions[submissionIndex],
      ...updateFields,
      id: submissions[submissionIndex].id,
      submittedAt: submissions[submissionIndex].submittedAt,
      updatedAt: new Date().toISOString()
    };
    await saveSubmissions(submissions);
    res.json({
      success: true,
      message: 'Submission updated successfully',
      data: submissions[submissionIndex]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to update submission'
    });
  }
});

// DELETE /api/case-studies/:id - Delete submission
app.delete('/api/case-studies/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const submissions = await loadSubmissions();
    const filteredSubmissions = submissions.filter(s => s.id !== id);

    if (filteredSubmissions.length === submissions.length) {
      return res.status(404).json({
        success: false,
        error: 'Submission not found'
      });
    }

    await saveSubmissions(filteredSubmissions);

    res.json({
      success: true,
      message: 'Submission deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting submission:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete submission'
    });
  }
});

// GET /api/group-submissions?group=GROUP_NAME - Get all focus group submissions for a group
app.get('/api/group-submissions', async (req, res) => {
  try {
    const { group } = req.query;
    if (!group) {
      return res.status(400).json({ success: false, error: 'Group name required' });
    }
    const submissions = await loadFocusGroupSubmissions();
    console.log('Loaded submissions:', submissions.length);
    console.log('First submission structure:', submissions[0]);
    
    // Group submissions by their original submission ID to get the most recent version
    const submissionGroups = {};
    
    submissions.forEach(s => {
      if (s.cases && s.cases.length) {
        // Check if any case in this submission belongs to the requested group
        const hasGroupCases = s.cases.some(c => c.group === group);
        if (hasGroupCases) {
          // For original submissions, use the standard key
          // For edited submissions, use the originalSubmissionId
          const key = s.isEditedVersion && s.originalSubmissionId 
            ? s.originalSubmissionId 
            : `${s.username}|${s.email}|${s.submittedAt}`;
          
          // Keep only the most recent version (edited version takes precedence)
          if (!submissionGroups[key] || s.isEditedVersion) {
            submissionGroups[key] = s;
          }
        }
      }
    });
    
    // Return all cases from all submissions, maintaining the original structure
    const groupSubs = Object.values(submissionGroups).map(s => {
      console.log('Processing submission:', s.username, 'with cases:', s.cases);
      const filteredCases = s.cases.filter(c => c.group === group);
      console.log('Filtered cases for group', group, ':', filteredCases);
      return {
        conceptCard: s.conceptCard,
        username: s.username,
        email: s.email,
        submittedAt: s.submittedAt,
        isEditedVersion: s.isEditedVersion || false,
        originalSubmissionId: s.originalSubmissionId || null,
        editedBy: s.editedBy || null,
        editTimestamp: s.editTimestamp || null,
        cases: filteredCases
      };
    });
    
    res.json({
      success: true,
      data: groupSubs,
      count: groupSubs.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to load group submissions' });
  }
});

// POST /api/case-studies-focus-group - Submit new focus group case study set
app.post('/api/case-studies-focus-group', async (req, res) => {
  try {
    await ensureDataDir();
    const submission = req.body;
    // Optionally add a timestamp or server-side ID here
    const submissions = await loadFocusGroupSubmissions();
    submissions.push(submission);
    await saveFocusGroupSubmissions(submissions);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to save focus group submission' });
  }
});

// Register endpoint
app.post('/api/auth/register', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ success: false, message: 'All fields required' });
  }
  const users = await loadUsers();
  if (users.find(u => u.email === email)) {
    return res.status(400).json({ success: false, message: 'Email already registered' });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const newUser = {
    id: Date.now().toString(),
    username,
    email,
    passwordHash,
    createdAt: new Date().toISOString()
  };
  users.push(newUser);
  await saveUsers(users);
  res.json({ success: true, message: 'Registered successfully', username, email });
});

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
  const { usernameOrEmail, password } = req.body;
  if (!usernameOrEmail || !password) {
    return res.status(400).json({ success: false, message: 'All fields required' });
  }
  const users = await loadUsers();
  const user = users.find(u => u.email === usernameOrEmail || u.username === usernameOrEmail);
  if (!user) {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
  res.json({ success: true, username: user.username, email: user.email, role: user.role || 'user' });
});

// Update user profile endpoint
app.post('/api/auth/update-profile', async (req, res) => {
  try {
    const { email, username, school, country, city, avatar } = req.body;
    
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }
    
    const users = await loadUsers();
    const userIndex = users.findIndex(u => u.email === email);
    
    if (userIndex === -1) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    // Update user profile data (email cannot be changed)
    const updatedUser = {
      ...users[userIndex],
      username: username || users[userIndex].username,
      school: school || null,
      country: country || null,
      city: city || null,
      avatar: avatar || 'default',
      updatedAt: new Date().toISOString()
    };
    
    users[userIndex] = updatedUser;
    await saveUsers(users);
    
    res.json({ 
      success: true, 
      message: 'Profile updated successfully',
      user: {
        username: updatedUser.username,
        email: updatedUser.email, // Keep original email
        role: updatedUser.role || 'user',
        school: updatedUser.school,
        country: updatedUser.country,
        city: updatedUser.city,
        avatar: updatedUser.avatar
      }
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ success: false, message: 'Failed to update profile' });
  }
});

// Get user profile endpoint
app.get('/api/auth/profile/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const users = await loadUsers();
    const user = users.find(u => u.email === email);
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    res.json({
      success: true,
      user: {
        username: user.username,
        email: user.email,
        role: user.role || 'user',
        school: user.school || null,
        country: user.country || null,
        city: user.city || null,
        avatar: user.avatar || 'default'
      }
    });
  } catch (error) {
    console.error('Error getting profile:', error);
    res.status(500).json({ success: false, message: 'Failed to get profile' });
  }
});


// Endpoint to save edited submissions (creates new files instead of updating)
app.post('/api/save-edited-submission', async (req, res) => {
  try {
    const { originalSubmissionId, editedData, facilitatorComment, editedBy } = req.body;
    
    // Load existing data
    const focusGroupData = JSON.parse(await fs.readFile(FOCUS_GROUP_FILE, 'utf8'));
    
    // Find the original submission
    const originalSubmission = focusGroupData.find(sub => 
      `${sub.username}|${sub.email}|${sub.submittedAt}` === originalSubmissionId
    );
    
    if (!originalSubmission) {
      return res.status(404).json({ success: false, message: 'Original submission not found' });
    }
    
    // Check if an edited version already exists for this submission
    const existingEditedVersion = focusGroupData.find(sub => 
      sub.isEditedVersion && sub.originalSubmissionId === originalSubmissionId
    );
    
    // Also check if the submission being edited is itself an edited version
    const isEditingEditedVersion = focusGroupData.find(sub => 
      sub.isEditedVersion && `${sub.username}|${sub.email}|${sub.submittedAt}` === originalSubmissionId
    );
    
    let newSubmission;
    let isNewVersion = false;
    
    if (existingEditedVersion) {
      // Update the existing edited version
      newSubmission = {
        ...originalSubmission, // Start with original structure
        ...existingEditedVersion, // Keep existing edit metadata
        ...editedData, // Apply new edits
        editTimestamp: new Date().toISOString(),
        editedBy: editedBy || 'unknown'
      };
      
      // Replace the existing edited version
      const existingIndex = focusGroupData.findIndex(sub => 
        sub.isEditedVersion && sub.originalSubmissionId === originalSubmissionId
      );
      focusGroupData[existingIndex] = newSubmission;
    } else if (isEditingEditedVersion) {
      // We're editing an already edited version, so update it in place
      newSubmission = {
        ...isEditingEditedVersion, // Keep existing structure
        ...editedData, // Apply new edits
        editTimestamp: new Date().toISOString(),
        editedBy: editedBy || 'unknown'
      };
      
      // Replace the edited version in place
      const existingIndex = focusGroupData.findIndex(sub => 
        sub.isEditedVersion && `${sub.username}|${sub.email}|${sub.submittedAt}` === originalSubmissionId
      );
      focusGroupData[existingIndex] = newSubmission;
    } else {
      // Create new edited version
      newSubmission = {
        ...originalSubmission, // Maintain original structure
        ...editedData, // Apply edits
        submittedAt: new Date().toISOString(),
        isEditedVersion: true,
        originalSubmissionId: originalSubmissionId,
        editedBy: editedBy || 'unknown',
        editTimestamp: new Date().toISOString()
      };
      
      // Add to the data
      focusGroupData.push(newSubmission);
      isNewVersion = true;
    }
    
    // Save updated data
    await fs.writeFile(FOCUS_GROUP_FILE, JSON.stringify(focusGroupData, null, 2));
    
    // Add facilitator comment if provided
    if (facilitatorComment && facilitatorComment.trim()) {
      // Add facilitator comment directly to the edited submission
      newSubmission.facilitatorComment = facilitatorComment;
      newSubmission.facilitatorCommentTimestamp = new Date().toISOString();
      newSubmission.facilitatorCommentBy = editedBy || 'unknown';
    }
    
    res.json({ 
      success: true, 
      message: isNewVersion ? 'Edited submission saved successfully' : 'Edited submission updated successfully',
      newSubmissionId: newSubmission.submittedAt,
      isNewVersion: isNewVersion
    });
    
  } catch (error) {
    console.error('Error saving edited submission:', error);
    res.status(500).json({ success: false, message: 'Failed to save edited submission' });
  }
});

// GET /api/user-value-history - Get user's value history from submissions
app.get('/api/user-value-history/:email', async (req, res) => {
  try {
    const { email } = req.params;
    
    // Load both types of submissions
    const focusGroupData = await loadFocusGroupSubmissions();
    const individualData = await loadSubmissions();
    
    // Collect all values from user's submissions
    const userValues = new Set();
    const userValueDetails = [];
    
    // Check focus group submissions
    const userFocusGroupSubmissions = focusGroupData.filter(sub => sub.email === email);
    userFocusGroupSubmissions.forEach(sub => {
      if (sub.cases && Array.isArray(sub.cases)) {
        sub.cases.forEach(caseItem => {
          if (caseItem.values && Array.isArray(caseItem.values)) {
            caseItem.values.forEach(valueItem => {
              if (valueItem.value && !userValues.has(valueItem.value)) {
                userValues.add(valueItem.value);
                userValueDetails.push({
                  value: valueItem.value,
                  definition: valueItem.definition || '',
                  source: 'focus-group',
                  submissionDate: sub.submittedAt
                });
              }
            });
          }
        });
      }
    });
    
    // Check individual submissions
    const userIndividualSubmissions = individualData.filter(sub => sub.author === email || sub.email === email);
    userIndividualSubmissions.forEach(sub => {
      if (sub.cases && Array.isArray(sub.cases)) {
        sub.cases.forEach(caseItem => {
          if (caseItem.values && Array.isArray(caseItem.values)) {
            caseItem.values.forEach(valueItem => {
              if (valueItem.value && !userValues.has(valueItem.value)) {
                userValues.add(valueItem.value);
                userValueDetails.push({
                  value: valueItem.value,
                  definition: valueItem.definition || '',
                  source: 'individual',
                  submissionDate: sub.submittedAt
                });
              }
            });
          }
        });
      }
    });
    
    res.json({
      success: true,
      data: userValueDetails,
      count: userValueDetails.length,
      hasSubmissions: userValueDetails.length > 0
    });
    
  } catch (error) {
    console.error('Error fetching user value history:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch user value history' 
    });
  }
});

// GET /api/user-tension-history - Get user's tension history from submissions
app.get('/api/user-tension-history/:email', async (req, res) => {
  try {
    const { email } = req.params;
    
    // Define predefined tensions to filter out
    const predefinedTensions = [
      "Privacy vs. Transparency",
      "Accuracy vs. Fairness", 
      "Autonomy vs. Safety",
      "Efficiency vs. Explainability",
      "Innovation vs. Regulation",
      "Individual vs. Collective Good",
      "Accessibility vs. Complexity",
      "Customization vs. Standardization"
    ];
    
    // Load both types of submissions
    const focusGroupData = await loadFocusGroupSubmissions();
    const individualData = await loadSubmissions();
    
    // Collect all tensions from user's submissions
    const userTensions = new Set();
    const userTensionDetails = [];
    
    // Check focus group submissions
    const userFocusGroupSubmissions = focusGroupData.filter(sub => sub.email === email);
    userFocusGroupSubmissions.forEach(sub => {
      if (sub.cases && Array.isArray(sub.cases)) {
        sub.cases.forEach(caseItem => {
          if (caseItem.tensions && Array.isArray(caseItem.tensions)) {
            caseItem.tensions.forEach(tensionItem => {
              // Only include custom tensions (not predefined ones)
              if (tensionItem.value && 
                  !userTensions.has(tensionItem.value) && 
                  !predefinedTensions.includes(tensionItem.value)) {
                userTensions.add(tensionItem.value);
                userTensionDetails.push({
                  value: tensionItem.value,
                  definition: tensionItem.definition || '',
                  source: 'focus-group',
                  submissionDate: sub.submittedAt
                });
              }
            });
          }
        });
      }
    });
    
    // Check individual submissions
    const userIndividualSubmissions = individualData.filter(sub => sub.author === email || sub.email === email);
    userIndividualSubmissions.forEach(sub => {
      if (sub.cases && Array.isArray(sub.cases)) {
        sub.cases.forEach(caseItem => {
          if (caseItem.tensions && Array.isArray(caseItem.tensions)) {
            caseItem.tensions.forEach(tensionItem => {
              // Only include custom tensions (not predefined ones)
              if (tensionItem.value && 
                  !userTensions.has(tensionItem.value) && 
                  !predefinedTensions.includes(tensionItem.value)) {
                userTensions.add(tensionItem.value);
                userTensionDetails.push({
                  value: tensionItem.value,
                  definition: tensionItem.definition || '',
                  source: 'individual',
                  submissionDate: sub.submittedAt
                });
              }
            });
          }
        });
      }
    });
    
    res.json({
      success: true,
      data: userTensionDetails,
      count: userTensionDetails.length,
      hasSubmissions: userTensionDetails.length > 0
    });
    
  } catch (error) {
    console.error('Error fetching user tension history:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch user tension history' 
    });
  }
});

// Start server
async function startServer() {
  await ensureDataDir();
  
  app.listen(PORT, () => {
    console.log(`Case Study API server running on http://localhost:${PORT}`);
    console.log(`Data will be stored in: ${SUBMISSIONS_FILE}`);
  });
}

startServer().catch(console.error);

module.exports = app; 