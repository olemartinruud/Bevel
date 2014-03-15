// Constants
AUTHENTICATION_BEGIN_MESSAGE = "Logging in...";
AUTHENTICATION_SUCCUESS_MESSAGE = ""; // Should never actually show.
AUTHENTICATION_FAILURE_MESSAGE = "Incorrect password"
PLACEHOLDER_COLOURS = [
	'#FF6138',
	'#FFFF9D',
	'#BEEB9F',
	'#79BD8F',
	'#00A388',
];

// Globals
authenticating = false;
activeUser = null;
availableUsers = [];

// Gets the list of available users from lightdm and fills out the #user-list
// element with them. Records the elements created for each user in the
// availableUsers array.
function generateUserList() {
	var userList = $('#user-list');
	for (i in lightdm.users) {
		var user = lightdm.users[i];
		var userListEntry = $('<div />', {class: 'user'});

		userListEntry.data('user', user);

		// Add an image to represent the user. If no .face image is available, use a
		// colour from the palette.
		var userImage = $('<div />', {class: 'bubble'});
		if (user.image.length > 0) {
			userImage.css({'background-image': 'url('+user.image+')'});
		} else {
			userImage.css({backgroundColor: PLACEHOLDER_COLOURS[i % PLACEHOLDER_COLOURS.length]});
		}
		userImage.appendTo(userListEntry);

		// Add the user's full name if it's specified, otherwise fallback to using
		// just their username.
		var username = $('<div />', {class: 'user-name'});
		if (user.display_name.length > 0) {
			username.text(user.display_name);
		} else {
			username.text(user.name);
		}
		username.appendTo(userListEntry);

		availableUsers.push(userListEntry);
		userListEntry.appendTo(userList);
	}
}

// Choose a user to be initially selected when the login screen loads.
function chooseInitialSelection() {
	if (availableUsers.length == 1) {
		selectUser(availableUsers[0]);
	} else {
		// TODO: Do something sensible for multiple users. This might just be
		// nothing.
	}
}

// Highlights only the given user, displays the password form and begins the
// authentication procedure.
function selectUser(user) {
	// Selecting a user shouldn't interrupt a login attempt.
	if (authenticating) { return false; }

	// Dim all users except for this one.
	user.parent().children().addClass('hidden').removeClass('active');
	user.addClass('active').removeClass('hidden');

	// Show the password form, clear and focus it.
	$('#password-container').removeClass('hidden').find('input').val('').focus();
	$('#password').removeAttr('disabled');

	activeUser = user;
	var userData = user.data('user');
	lightdm.start_authentication(userData.name);
}

// Attempt to authenticate the selected user with lightdm.
function doAuthentication(password) {
	// This shouldn't happen, but don't try to authenticate with a null user.
	if (activeUser == null) { return false; }

	authenticating = true;
	var userData = activeUser.data('user');
	// lightdm.start_authentication(userData.name);
	lightdm.provide_secret(password);

	// Display the message for this event and disable the form.
	$('#authentication-message').removeClass('error').text(AUTHENTICATION_BEGIN_MESSAGE).addClass('active');
	$('#password').attr('disabled', 'disabled');
}

function finishAuthentication() {
	if (lightdm.is_authenticated) {
		lightdm.login(lightdm.authentication_user, lightdm.default_session);
	} else {
		// Authentication failed. Reset the password form and display a message.
		authenticating = false;
		selectUser(activeUser);

		// Fade out the current message, replace it with the new one, then eventually fade out that.
		$('#authentication-message').removeClass('active');

		setTimeout(function() {
			$('#authentication-message').text(AUTHENTICATION_FAILURE_MESSAGE).addClass('active error');
			setTimeout(function() {
				$('#authentication-message').removeClass('active error');
			}, 3000); // TODO: This might fade out the message incorrectly if it changed.
		}, 300);
	}
}


$(document).ready(function() {
	// The userlist and maybe preselect one.
	generateUserList();
	chooseInitialSelection();

	// Timed login is currently not supported, so cancel it.
	lightdm.cancel_timed_login();
	
	// Register closures for events.
	$('.user').on('click', function(event) {selectUser($(this));});
	$('#password').on('keyup', function(e) {
		if (e.keyCode != 13) { return; }
		doAuthentication($(this).val());
	})
	window.authentication_complete = function() {finishAuthentication();};
	
	// Ready to go! Fade in the login screen.
	$('body').animate({'opacity': '1'});
});

