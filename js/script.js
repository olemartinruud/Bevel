// Constants
var AUTHENTICATION_BEGIN_MESSAGE = 'Logging in...';
// var AUTHENTICATION_SUCCUESS_MESSAGE = ''; // Should never actually show.
var AUTHENTICATION_FAILURE_MESSAGE = 'Incorrect password';
var PLACEHOLDER_COLOURS = ['#FF6138', '#FFFF9D', '#BEEB9F', '#79BD8F', '#00A388'];
var THEME_FOLDER = '/usr/share/lightdm-webkit/themes/bevelhex/';
var ICON_FOLDER = THEME_FOLDER + 'resources/icons/hex/';
var DUMMY_FOLDER = THEME_FOLDER + 'resources/dummy/';

// Globals
var authenticating = false;
var activeUser = null;
var activeSession = null;
var availableUsers = [];
var availableSessions = [];

function hashCode (str) {
  var hash = 0;
  if (str.length === 0) return hash;
  for (var i = 0; i < str.length; i++) {
    var char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash;
};

/**
 * Gets the list of available users from lightdm and fills out the #user-list
 * element with them. Records the elements created for each user in the
 * availableUsers array.
 */
function generateUserList () {
  var userList = $('#user-list');
  for (var i in lightdm.users) {
    var user = lightdm.users[i];
    var userListEntry = $('<div />', {
      class: 'user'
    });

    userListEntry.data('user', user);

    // Add an image to represent the user. If no .face image is available,
    // use a colour from the palette.
    var userImage = $('<div />', {
      class: 'user-image'
    });
    // Set the background colour regardless since the user.image path might
    // be invalid.
    userImage.css({
      backgroundColor: PLACEHOLDER_COLOURS[i % PLACEHOLDER_COLOURS.length]
    });
    if (user.image) {
      userImage.css({
        'background-image': 'url(' + user.image + ')'
      });
    }
    userImage.appendTo(userListEntry);

    // Add the user's full name if it's specified, otherwise fallback to
    // using just their username.
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
 * Generates a list of images in #system-controls which contain the icons for the actions,
 * from an arraylist of html-elements in JQuery-form
 */
function generateControlImageList (controlElements) {
  controlElements.each(function () {
    $(this).attr('src', ICON_FOLDER + $(this).attr('data-action') + '.png');
  });
}

/**
 * Generates the control buttons from an arraylist of html-elements in JQuery-form
 */
function generateControls (controlElements) {
  var possibleActions = {
    'shutdown': lightdm.can_shutdown,
    'restart': lightdm.can_restart,
    'suspend': lightdm.can_suspend,
    'hibernate': lightdm.can_hibernate
  };
  controlElements.each(function () {
    if (possibleActions.hasOwnProperty($(this).attr('data-action')) && possibleActions[$(this).attr('data-action')]) {
      $(this).click(function (e) {
        lightdm[$(this).attr('data-action')]();
      });
    }
  });
  generateControlImageList(controlElements);
}

/**
 * Chooses a user to be initially selected when the interface finishes loading.
 */
function chooseInitialSelection () {
  if (availableUsers.length === 1) {
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
function selectUser (user) {
  // Selecting a user shouldn't interrupt a login attempt.
  if (authenticating) {
    return false;
  }

  // Selecting the active user should be treated as unselecting.
  // Compare the data attribute because javascript does weird things. I think
  // it's doing the assignment to activeUser by value but then comparing by
  // memory address? Maybe? TODO: Work this out.
  if (activeUser !== null && activeUser.data('user') === user.data('user')) {
    unselect();
    return false;
  }

  // Select this user's default session.
  selectUserSession(user);

  // Dim all users except for this one.
  user.siblings().addClass('hidden').removeClass('active');
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
  $('#password-input').removeAttr('disabled');
  $('#authentication-wrapper').removeClass('hidden').find('input').val('').focus();
  $('#session-list-wrapper').removeClass('hidden');

  activeUser = user;
  var userData = user.data('user');
  lightdm.start_authentication(userData.name);
}

/**
 * Unselects (deselects?) the currently selected user.
 */
function unselect () {
  // Unselecting a user shouldn't interrupt a login attempt.
  if (authenticating) {
    return false;
  }

  // Reset the user divs.
  activeUser.siblings().removeClass('hidden').removeClass('active');
  $('#user-list').css({
    left: 0,
    right: 0
  });

  // Hide the password entry. Also disable it so it loses focus.
  $('#authentication-wrapper').addClass('hidden');
  $('#session-list-wrapper').addClass('hidden');
  $('#password-input').attr('disabled', 'disabled');

  activeUser = null;
}

/**
 * Attempts to authenticate the selected user with lightdm using the contents
 * of the password form.
 */
function doAuthentication (password) {
  // This shouldn't happen, but don't try to authenticate with a null user.
  if (activeUser === null) {
    return false;
  }

  $('#authentication-wrapper').removeClass('error');
  $('#authentication-wrapper').addClass('authenticating');

  // Display the message for this event and disable the form.
  $('#authentication-message').removeClass('error').text(AUTHENTICATION_BEGIN_MESSAGE).addClass('active');
  $('#password-input').attr('disabled', 'disabled');

  var passwordBitsElement = $('#password-bits');

  var passwordHash = hashCode($('#password-input').val()).toString(2).replace('-', '');
  var counter = 1;
  var hashLength = passwordHash.length;
  var intervalId = setInterval(function () {
    if (counter + 3 >= hashLength) {
      clearInterval(intervalId);
      passwordBitsElement.addClass('shift-of-screen');
    }
    passwordBitsElement.prepend(passwordHash.substr(hashLength - counter - 2, 3));
    counter += 3;
  }, 5);
  setTimeout(function () {
    authenticating = true;
    // var userData = activeUser.data('user');
    // lightdm.start_authentication(userData.name);
    lightdm.provide_secret(password);
  }, 800);
}

/**
 * Examines the result of a previous authentication attempts. On success, this
 * function tells lightdm to start the user's session. On failure, this
 * function prompts the user to retry.
 */
function finishAuthentication () {
  if (lightdm.is_authenticated) {
    $('#UI').animate({
      'opacity': '0'
    }, 600);
    // Wait a moment before actually logging in so we have time to fade out the
    // controls.
    setTimeout(function () {
      lightdm.login(lightdm.authentication_user, activeSession.data('id'));
    }, 700);
  } else {
    // Authentication failed. Reset the password form and display a message.
    authenticating = false;

    $('#authentication-wrapper').removeClass('authenticating');
    $('#password-bits').html('').removeClass('shift-of-screen');

    // Just reselecting would be treated as an unselect, so we clear activeUser
    // first.
    var retryUser = activeUser;
    unselect();
    selectUser(retryUser);

    // Fade out the current message, replace it with the new one, then
    // eventually fade out that.
    $('#authentication-message').removeClass('active');

    setTimeout(function () {
      $('#authentication-message').text(AUTHENTICATION_FAILURE_MESSAGE).addClass('active error');
      setTimeout(function () {
        $('#authentication-message').removeClass('active error');
      }, 3000); // TODO: This might fade out the message incorrectly if it changed.
    }, 700);
  }
}

/**
 * Fills out the #session-list div and availableSession array with the user
 * sessions available.
 */
function generateSessionList () {
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

/**
 * Returns the element associated with the given session id. Defaults to the
 * first session in the list if none matching are found.
 */
function lookupSessionById (id) {
  if (availableSessions.length === 0) {
    return false;
  }

  for (var i in availableSessions) {
    var session = availableSessions[i];
    if (session.data('id') === id) {
      return session;
    }
  }

  // Default to the first listed session.
  return availableSessions[0];
}

/**
 * Returns the default lightdm session, or the first session available if this
 * value is unset or is set incorrectly.
 */
function getDefaultSession () {
  if (availableSessions.length === 0) {
    return false;
  }
  var lightdmDefault = lightdm.default_session;

  if (lightdmDefault === null || lightdmDefault === '' || lightdmDefault === 'default') {
    return availableSessions[0];
  } else {
    return lookupSessionById(lightdmDefault);
  }
}

/**
 * Selects the preferred session of the given user.
 */
function selectUserSession (user) {
  var preferredSession = user.data('user').session;

  if (preferredSession === 'default') {
    selectSession(getDefaultSession());
  } else {
    selectSession(preferredSession);
  }
}

/**
 * Sets the given session to be the activeSession and moves it to the centre of
 * the screen.
 */
function selectSession (id) {
  if (authenticating) {
    return false;
  }
  if (availableSessions.length === 0) {
    return false;
  }
  var selectedSession = lookupSessionById(id);

  // Highlight this session, unhighlight all others.
  selectedSession.siblings().removeClass('active');
  selectedSession.addClass('active');

  // Set as the selected session.
  window.activeSession = selectedSession;

  // To centre the active session we need to know the total length to shift the
  // session list to the left.
  var sessionListFloaterEl = $('#session-list');

  var shift = (sessionListFloaterEl.outerWidth() - activeSession.outerWidth(true)) / 2;

  for (var session of availableSessions) {
    if ($(session).data('id') === activeSession.data('id')) break;
    shift -= $(session).outerWidth(true);
  }

  sessionListFloaterEl.css({
    'left': shift
  });
}

/**
 * Selects a random background from a given folder
 */
function selectRandomBackgroundImage (folderPath) {
  var imagePathList = window.theme_utils ? window.theme_utils.dirlist(folderPath) : [ folderPath + 'background.jpg' ];
  var randomIndex = Math.floor(Math.random() * imagePathList.length);
  return imagePathList[randomIndex];
}

/**
 *  Updates the clock
 */
function initializeClock () {
  var clock = $('#big-clock');
  if (window.moment) {
    clock.html(moment().format('HH:mm:ss'));
    setInterval(() => {
      clock.html(moment().format('HH:mm:ss'));
    }, 1000);
  } else {
    clock.html('12:00:00');
  }
}

/**
 *
 */
function setLoginWrapperDisplayEvents () {
  var loginWrapper = $('#login-section-wrapper');
  var overlay = $('#full-overlay');

  // Ready to go! Activate on keypress
  $(document).on('keyup', function (e) {
    if (loginWrapper.hasClass('hidden')) {
      loginWrapper.removeClass('hidden');
      overlay.removeClass('hidden');
    } else if (((e.key && (e.key === 'Escape' || e.key === 'esc')) || e.keyCode === 27) && !loginWrapper.hasClass('hidden')) {
      loginWrapper.addClass('hidden');
      overlay.addClass('hidden');
    }
  });
  $(document).click(function (e) {
    if (loginWrapper.hasClass('hidden')) {
      loginWrapper.removeClass('hidden');
      overlay.removeClass('hidden');
    } else if (!$.data($(e.target).get(0), 'events')) {
      loginWrapper.addClass('hidden');
      overlay.addClass('hidden');
    }
  });
}

$(document).ready(function () {
  // Get the sessions available.
  generateSessionList();

  // The userlist and maybe preselect one.
  generateUserList();
  chooseInitialSelection();

  // Makes the controls ready for use
  generateControls($('#system-controls').children());

  // Selects a random background image
  var backgroundImagesPath = window.greeter_config ? greeter_config.get_str('branding', 'background_images') : DUMMY_FOLDER;
  $('#full-background').css('background-image', 'url(' + selectRandomBackgroundImage(backgroundImagesPath) + ')'); // TODO Change to greeter_config.branding.background_images when problem is fixed

  // Timed login is currently not supported, so cancel it.
  lightdm.cancel_timed_login();

  // Register closures for events.
  $('.user-image').click(function (e) {
    selectUser($(this).parent());
  });
  $('.session').click(function (e) {
    selectSession($(this).data('id'));
  });
  $('#password-input').on('keyup', function (e) {
    if (((e.key && (e.key === 'Enter' || e.key === 'ent')) || e.keyCode === 13)) {
      doAuthentication($(this).val());
    }
  });
  window.authentication_complete = function () {
    finishAuthentication();
  };

  initializeClock();

  setLoginWrapperDisplayEvents();
});
