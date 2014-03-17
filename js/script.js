// Constants
var AUTHENTICATION_BEGIN_MESSAGE = "Logging in...";
var AUTHENTICATION_SUCCUESS_MESSAGE = ""; // Should never actually show.
var AUTHENTICATION_FAILURE_MESSAGE = "Incorrect password";
var PLACEHOLDER_COLOURS = [
    '#FF6138',
    '#FFFF9D',
    '#BEEB9F',
    '#79BD8F',
    '#00A388',
];

// Globals
var authenticating = false;
var activeUser = null;
var activeSession = null;
var availableUsers = [];
var availableSessions = [];

/**
 * Gets the list of available users from lightdm and fills out the #user-list
 * element with them. Records the elements created for each user in the
 * availableUsers array.
 */
function generateUserList() {
    var userList = $('#user-list');
    for (var i in lightdm.users) {
        var user = lightdm.users[i];
        var userListEntry = $('<div />', {
            class: 'user'
        });


        userListEntry.data('user', user);

        // Add an image to represent the user. If no .face image is available, use a
        // colour from the palette.
        var userImage = $('<div />', {
            class: 'bubble'
        });
        // Set the background colour regardless since the user.image path might be invalid.
        userImage.css({
            backgroundColor: PLACEHOLDER_COLOURS[i % PLACEHOLDER_COLOURS.length]
        });
        if (user.image.length > 0) {
            userImage.css({
                'background-image': 'url(' + user.image + ')'
            });
        }
        userImage.appendTo(userListEntry);

        // Add the user's full name if it's specified, otherwise fallback to using
        // just their username.
        var username = $('<div />', {
            class: 'user-name'
        });
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

/**
 * Chooses a user to be initially selected when the interface finishes loading.
 */
function chooseInitialSelection() {
    if (availableUsers.length == 1) {
        selectUser(availableUsers[0]);
    } else {
      // If no user is selected then there won't be a session selected either.
      // We want to avoid ever having activeSession === null.
      selectSession(getDefaultSession());
    }
}

/**
 * Selects a user to begin the authentication procedure with. This function
 * also takes care of dimming the other, unselected users.
 * When called with the currently selected user, this function will simply call
 * unselect()
 */
function selectUser(user) {
    // Selecting a user shouldn't interrupt a login attempt.
    if (authenticating) {
        return false;
    }

    // Selecting the active user should be treated as unselecting.
    // Compare the data attribute because javascript does weird things. I think
    // it's doing the assignment to activeUser by value but then comparing by
    // memory address? Maybe? TODO: Work this out.
    if (activeUser !== null && activeUser.data('user') == user.data('user')) {
        unselect();
        return false;
    }

    // Select this user's default session.
    selectUserSession(user);

    // Dim all users except for this one.
    user.parent().children().addClass('hidden').removeClass('active');
    user.addClass('active').removeClass('hidden');

    // Move the selected user's image to the centre.
    var index = user.index() + 1;
    var total = user.siblings().length + 1;
    var shift = ((total + 1) / 2 - index) * user.outerWidth(true);
    $('#user-list').css({
        left: shift,
        right: -shift
    });

    // Show the password form, clear and focus it.
    $('#password').removeAttr('disabled');
    $('#password-container').removeClass('hidden').find('input').val('').focus();

    activeUser = user;
    var userData = user.data('user');
    lightdm.start_authentication(userData.name);
}

/**
 * Unselects (deselects?) the currently selected user.
 */
function unselect() {
    // Unselecting a user shouldn't interrupt a login attempt.
    if (authenticating) {
        return false;
    }

    // Reset the user divs.
    activeUser.parent().children().removeClass('hidden').removeClass('active');
    $('#user-list').css({
        left: 0,
        right: 0
    });

    // Hide the password entry. Also disable it so it loses focus.
    $('#password-container').addClass('hidden');
    $('#password').attr('disabled', 'disabled');

    activeUser = null;
}

/**
 * Attempts to authenticate the selected user with lightdm using the contents
 * of the password form.
 */
function doAuthentication(password) {
    // This shouldn't happen, but don't try to authenticate with a null user.
    if (activeUser === null) {
        return false;
    }

    authenticating = true;
    var userData = activeUser.data('user');
    // lightdm.start_authentication(userData.name);
    lightdm.provide_secret(password);

    // Display the message for this event and disable the form.
    $('#authentication-message').removeClass('error').text(
        AUTHENTICATION_BEGIN_MESSAGE).addClass('active');
    $('#password').attr('disabled', 'disabled');
}

/**
 * Examines the result of a previous authentication attempts. On success, this
 * function tells lightdm to start the user's session. On failure, this
 * function prompts the user to retry.
 */
function finishAuthentication() {
    if (lightdm.is_authenticated) {
        $('body').animate({
            'opacity': '0'
        }, 400);

        // Wait a moment before actually logging in so we have time to fade out the
        // controls.
        setTimeout(function () {
            lightdm.login(lightdm.authentication_user, activeSession.data('id'));
        }, 500);
    } else {
        // Authentication failed. Reset the password form and display a message.
        authenticating = false;

        // Just reselecting would be treated as an unselect, so we clear activeUser
        // first.
        var retryUser = activeUser;
        unselect();
        selectUser(retryUser);

        // Fade out the current message, replace it with the new one, then eventually fade out that.
        $('#authentication-message').removeClass('active');

        setTimeout(function () {
            $('#authentication-message').text(
                AUTHENTICATION_FAILURE_MESSAGE).addClass('active error');
            setTimeout(function () {
                $('#authentication-message').removeClass('active error');
            }, 3000); // TODO: This might fade out the message incorrectly if it changed.
        }, 300);
    }
}

function generateSessionList() {
  var sessionList = $('#session-list');
  for (var i in lightdm.sessions) {
    var session = lightdm.sessions[i];
    var sessionListEntry = $('<div />', {
      class: 'session'
    });

    sessionListEntry.data('id', session.key);
    sessionListEntry.text(session.name);

    sessionListEntry.appendTo(sessionList);
    availableSessions.push(sessionListEntry);
  }
}

function lookupSessionById(id) {
  if (availableSessions.length === 0) { return false; }

  for (var i in availableSessions) {
    var session = availableSessions[i];
    if (session.data('id') == id) {
      return session;
    }
  }

  // Default to the first listed session.
  return availableSessions[0];
}

function getDefaultSession() {
  if (availableSessions.length === 0) { return false; }
  var lightdmDefault = lightdm.default_session;

  if (lightdmDefault === null || lightdmDefault === "" ||
      lightdmDefault == "default") {
    return availableSessions[0];
  } else {
    return lookupSessionById(lightdmDefault);
  }
}

function selectUserSession(user) {
  var preferredSession = user.data('user').session;

  if (preferredSession == "default") {
    selectSession(getDefaultSession());
  } else {
    selectSession(preferredSession);
  }
}

function selectSession(id) {
  if (authenticating) { return false; }
  if (availableSessions.length === 0) { return false; }
  var session = lookupSessionById(id);

  // Highlight this session, unhighlight all others.
  session.siblings().removeClass('active');
  session.addClass('active');

  // Set as the selected session.
  activeSession = session;

  // To centre the active session we need to know the total length to shift the
  // session list to the left.
  var shift = 0;
  var foundActive = false;
  for (var i=0; i<availableSessions.length; i++) {
    var iSession = availableSessions[i];
    if (iSession.data('id') != session.data('id')) {
      if (foundActive) {
        shift += iSession.width();
      } else {
        shift -= iSession.width();
      }
    } else {
      foundActive = true;
    }
  }

  $('#session-list').css({
    'left': shift
  });
}


$(document).ready(function () {
    // Get the sessions available.
    generateSessionList();

    // The userlist and maybe preselect one.
    generateUserList();
    chooseInitialSelection();

    // Timed login is currently not supported, so cancel it.
    lightdm.cancel_timed_login();

    // Register closures for events.
    $('.user').click(function (event) {
        selectUser($(this));
    });
    $('.session').click(function (event) {
        selectSession($(this).data('id'));
    });
    $('#password').on('keyup', function (e) {
        if (e.keyCode != 13) {
            return;
        }
        doAuthentication($(this).val());
    });
    window.authentication_complete = function () {
        finishAuthentication();
    };

    // Ready to go! Fade in the login screen.
    $('body').animate({
        'opacity': '1'
    }, 400);
});
