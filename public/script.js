	
	

/* ────────────────────────────────────────────────────────────── *
 *  1.  renderUserTickets                                         *
 *      – draws the user’s saved citation list                    *
 *      – handles “Show More / Show Less” toggle                  *
 * ────────────────────────────────────────────────────────────── */
function renderUserTickets(tickets) {
  tickets.sort((a, b) => new Date(b.issueDate) - new Date(a.issueDate));

  const MAX_VISIBLE = 3;          // show at most three lines until expanded
  let showingAll    = false;      // component‑local state

  const container  = document.getElementById('userTicketsContainer');
  const toggleBtn  = document.getElementById('toggleUserTickets');

  function refresh() {
    container.innerHTML = '';

    const slice = showingAll ? tickets : tickets.slice(0, MAX_VISIBLE);
    slice.forEach(t => {
      const item  = document.createElement('div');
      item.className = 'item';

      const when  = new Date(t.issueDate);
      const date  = when.toLocaleDateString();
      const time  = when.toLocaleTimeString([], { hour: 'numeric',
                                                  minute: '2-digit' });

      item.innerHTML = `
        <center>
          <div class="sighting-location">${t.location}</div>
          <div>${date} (${time})</div>`;
      container.appendChild(item);
    });

    /* toggle control */
    if (tickets.length > MAX_VISIBLE) {
      toggleBtn.style.display = '';
      toggleBtn.textContent   = showingAll ? 'Show Less' : 'Show More';
    } else {
      toggleBtn.style.display = 'none';
    }
  }

  refresh();
  /* click handler lives only inside the closure */
  toggleBtn.onclick = () => { showingAll = !showingAll; refresh(); };
}



/* ────────────────────────────────────────────────────────────── *
 *  2.  loadUserTickets – drop‑in replacement for the old one     *
 *      ✱ never touches #accountFormFields                        *
 *      ✱ only fills #userTicketsHeader and #userTicketsContainer *
 * ────────────────────────────────────────────────────────────── */
async function loadUserTickets (email) {
  try {
    const snap = await db.collection('current_users')
                         .where('email', '==', email)
                         .limit(1)
                         .get();
    if (snap.empty) return;                    // nothing stored for this user

    const userDoc = snap.docs[0].data();
    const tickets = userDoc.tickets || [];

    /* header badge */
    const header = document.getElementById('userTicketsHeader');
    //if (header) header.textContent = `Your saved tickets  (${tickets.length})`;

    /* draw list via helper */
    //renderUserTickets(tickets);

  } catch (err) {
    console.error('Error loading user tickets:', err);
  }
}



	
	
	
	let map;                // globally visible
  const markers = [];     // keep references so we can clear them later

  function initMap () {
    // Create the map centered on UCSC
    const map = new google.maps.Map(document.getElementById("map"), {
      center: { lat: 36.9916, lng: -122.0583 },
      zoom: 15,
      mapTypeId: "roadmap",
      styles: [
        {
          featureType: "poi",
          elementType: "labels",
          stylers: [{ visibility: "off" }],
        },
      ],
    });

    // Add blue pin for user location if available
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const userLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };

          new google.maps.Marker({
            position: userLocation,
            map: map,
            title: "Your Location",
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: "#4285F4",
              fillOpacity: 1,
              strokeColor: "#FFFFFF",
              strokeWeight: 2
            }
          });
        }
      );
    }

    // Sort allSightings by time_exact from newest to oldest
    const sortedSightings = [...allSightings].sort((a, b) => 
      new Date(b.time_exact) - new Date(a.time_exact)
    );

    // Get 3 unique locations
    const uniqueLocations = new Set();
    const pinsToShow = [];
    
    for (let s = 0; s < sortedSightings.length && pinsToShow.length < 3; s++) {
      const sighting = sortedSightings[s];
      // Skip if we already have this location
      if (uniqueLocations.has(sighting.college)) {
        continue;
      }
      const coords = getLocationCoordinates(sighting.college);
      if (coords) {
        uniqueLocations.add(sighting.college);
        pinsToShow.push({ sighting, coords });
        console.log(`Adding pin ${pinsToShow.length}: ${sighting.college} at ${new Date(sighting.time_exact).toLocaleString()}`);
      }
    }

    console.log(`Found ${pinsToShow.length} unique locations to show`);

    // Opacity values for 3 pins, from most recent to oldest
    const opacities = [1.0, 0.6, 0.3];
    
    // Create markers and store their positions for the route
    const waypoints = [];
    pinsToShow.forEach((item, idx) => {
      const { sighting, coords } = item;
      const sightingTime = new Date(sighting.time_exact);
      sightingTime.setHours(sightingTime.getHours() + 7); // Adjust time for display
      const opacity = opacities[idx];

      const marker = new google.maps.Marker({
        position: coords,
        map: map,
        title: `${sighting.college}\nTime: ${sightingTime.toLocaleTimeString()}\nDate: ${sightingTime.toLocaleDateString()}`,
        icon: {
          url: 'pin.png',
          scaledSize: new google.maps.Size(24, 36),
          anchor: new google.maps.Point(12, 36),
          labelOrigin: new google.maps.Point(12, 12),
        },
        optimized: false
      });
      marker.setOpacity(opacity);
      marker.addListener("click", () => {
        const infowindow = new google.maps.InfoWindow({
          content: `<div><strong>${sighting.college}</strong><br>Time: ${sightingTime.toLocaleTimeString()}<br>Date: ${sightingTime.toLocaleDateString()}<br>Citation #: ${sighting.citationNumber}</div>`
        });
        infowindow.open(map, marker);
      });

      // Store position for route
      waypoints.unshift(coords); // Add to beginning to reverse order (oldest first)
    });

    // If we have all 3 pins, create the driving route
    if (waypoints.length === 3) {
      const directionsService = new google.maps.DirectionsService();
      const directionsRenderer = new google.maps.DirectionsRenderer({
        map: map,
        suppressMarkers: true, // Don't show default markers
        polylineOptions: {
          strokeColor: '#4285F4', // Google Maps blue
          strokeOpacity: 1.0,
          strokeWeight: 4
        }
      });

      // Create route from oldest to newest
      const request = {
        origin: waypoints[0], // Oldest citation
        destination: waypoints[2], // Newest citation
        waypoints: [{
          location: waypoints[1], // Middle citation
          stopover: true
        }],
        travelMode: 'DRIVING'
      };

      directionsService.route(request, function(result, status) {
        if (status === 'OK') {
          directionsRenderer.setDirections(result);
        } else {
          console.warn('Directions request failed due to ' + status);
        }
      });
    }
  }

  function getLocationCoordinates(location) {
    // Define coordinates for each location
    const locationCoords = {
      "112 CORE WEST STRUCTURE": { lat: 36.9972, lng: -122.0637 },
      "103A EAST FIELD HOUSE": { lat: 36.9912, lng: -122.0548 },
      "119 MERRILL COLLEGE": { lat: 36.9997, lng: -122.0531 },
      "124 PORTER COLLEGE": { lat: 36.9942, lng: -122.0654 },
      "126 PERFORMING ARTS": { lat: 36.9946, lng: -122.0662 },
      "139A ENGINEERING II": { lat: 36.9995, lng: -122.0626 },
      "152 CROWN - MERRILL APARTMENTS": { lat: 37.0007, lng: -122.0534 },
      "111A CROWN COLLEGE PIT": { lat: 37.0000, lng: -122.0545 },
      "109 STEVENSON COLLEGE": { lat: 36.9971, lng: -122.0518 },
      "162 OAKES COLLEGE": { lat: 36.9912, lng: -122.0637 },
      "COLLEGE NINE": { lat: 37.0007, lng: -122.0573 },
      "RACHEL CARSON COLLEGE": { lat: 36.9917, lng: -122.0647 },
      "COWELL COLLEGE": { lat: 36.9965, lng: -122.0540 },
      "FAMILY STUDENT HOUSING": { lat: 36.9917, lng: -122.0701 },
      "ACADEMIC RESOURCE CENTER": { lat: 36.9982, lng: -122.0553 },
      "MCHENRY LIBRARY": { lat: 36.9959, lng: -122.0582 },
      "THIMANN LAB": { lat: 36.9982, lng: -122.0623 },
      "HAHN STUDENT SERVICES": { lat: 36.9921, lng: -122.0548 },
      "101 HAHN STUDENT SERVICES": { lat: 36.9921, lng: -122.0548 },
      "102 QUARRY PLAZA": { lat: 36.9974, lng: -122.0556 },
      "120A LOWER MCHENRY LIBRARY": { lat: 36.9959, lng: -122.0582 },
      "120B UPPER MCHENRY LIBRARY": { lat: 36.9959, lng: -122.0582 },
      "164 JOHN R. LEWIS COLLEGE": { lat: 37.0001, lng: -122.0590 },
      "165 JOHN R. LEWIS COLLEGE": { lat: 37.0001, lng: -122.0590 },
      "166 COLLEGE NINE": { lat: 37.0007, lng: -122.0573 },
      "167 COLLEGE NINE": { lat: 37.0007, lng: -122.0573 },
      "CROWN SERVICE ROAD": { lat: 37.0000, lng: -122.0545 },
      "STEINHART WAY": { lat: 36.9917, lng: -122.0647 },
      "107 COWELL - STEVENSON": { lat: 36.9979, lng: -122.0532 },
      "108 STEVENSON SERVICE ROAD": { lat: 36.9976, lng: -122.0529 },
      "110 STEVENSON COLLEGE": { lat: 36.9982, lng: -122.0516 },
      "STEVENSON SERVICE ROAD": { lat: 36.9976, lng: -122.0529 },
      "PORTER-KRESGE ROAD": { lat: 36.9942, lng: -122.0654 },
      "143 KRESGE COLLEGE": { lat: 36.9971, lng: -122.0671 },
      "145 KRESGE COLLEGE": { lat: 36.9973, lng: -122.0672 },
      "147 KRESGE COLLEGE": { lat: 36.9968, lng: -122.0653 },
      "KRESGE COLLEGE": { lat: 36.9971, lng: -122.0671 },
      "146 RACHEL CARSON COLLEGE": { lat: 36.9923, lng: -122.0645 },
      "RACHEL CARSON SERVICE ROAD": { lat: 36.9923, lng: -122.0645 },
      "WEST FIELD HOUSE - RACHEL CARSON COL": { lat: 36.9923, lng: -122.0645 },
      "160 OAKES COLLEGE": { lat: 36.9912, lng: -122.0637 },
      "161 OAKES COLLEGE": { lat: 36.9912, lng: -122.0637 },
      "OAKES COLLEGE": { lat: 36.9912, lng: -122.0637 },
      "OAKES FIELD SERVICE ROAD": { lat: 36.9912, lng: -122.0637 },
      "113 THIMANN LAB": { lat: 36.9982, lng: -122.0626 },
      "114 SOCIAL SCIENCES": { lat: 36.9995, lng: -122.0626 },
      "128 HEALTH CENTER": { lat: 36.9991, lng: -122.0582 },
      "138 BASKIN ENGINEERING": { lat: 37.0002, lng: -122.0639 },
      "139B COMMUNICATIONS": { lat: 37.0006, lng: -122.0621 },
      "140 FOUNDRY": { lat: 36.9957, lng: -122.0616 },
      "141 KERR HALL": { lat: 36.9965, lng: -122.0617 },
      "149 HELLER EXTENSION": { lat: 36.9797, lng: -122.0536 },
      "150A NORTH PERIMETER": { lat: 37.0025, lng: -122.0660 },
      "150B NORTH PERIMETER": { lat: 37.0025, lng: -122.0660 },
      "153 CROWN - MERRILL APARTMENTS": { lat: 37.0021, lng: -122.0542 },
      "154 CROWN - MERRILL APARTMENTS": { lat: 37.0022, lng: -122.0548 },
      "155 CROWN - MERRILL APARTMENTS": { lat: 36.9829, lng: -122.0597 },
      "156 FIRE HOUSE": { lat: 37.0000, lng: -122.0545 },
      "157 GRADUATE STUDENT APARTMENTS": { lat: 37.0021, lng: -122.0542 },
      "158 REDWOOD GROVE APARTMENTS": { lat: 37.0021, lng: -122.0542 },
      "159 REDWOOD GROVE APARTMENTS": { lat: 37.0021, lng: -122.0542 },
      "163 COWELL PROVOST": { lat: 36.9965, lng: -122.0540 },
      "168 AGROECOLOGY": { lat: 36.9797, lng: -122.0536 },
      "169 THE VILLAGE": { lat: 36.9917, lng: -122.0701 },
      "170 HAY BARN": { lat: 36.9797, lng: -122.0536 },
      "FARM ROAD": { lat: 36.9797, lng: -122.0536 },
      "FARM CASFS": { lat: 36.9797, lng: -122.0536 },
      "COOLIDGE DRIVE": { lat: 36.9917, lng: -122.0647 },
      "HAGAR DRIVE": { lat: 36.9917, lng: -122.0647 },
      "VILLAGE ROAD": { lat: 36.9917, lng: -122.0701 },
      "RED HILL ROAD": { lat: 36.9917, lng: -122.0647 },
      "LEONARDO LANE": { lat: 36.9917, lng: -122.0647 },
      "LOOKOUT": { lat: 36.9917, lng: -122.0647 },
      "EARTH AND MARINE SCIENCES BUILDING": { lat: 36.9982, lng: -122.0626 },
      "THEATER ARTS CENTER": { lat: 36.9946, lng: -122.0662 },
      "BASKIN VISUAL ARTS": { lat: 36.9946, lng: -122.0662 },
      "MERRILL COLLEGE": { lat: 36.9997, lng: -122.0531 },
      "MERRILL COLLEGE APTS": { lat: 36.9997, lng: -122.0531 },
      "CROWN COLLEGE": { lat: 37.0000, lng: -122.0545 },
      "CROWN APARTMENTS": { lat: 37.0000, lng: -122.0545 },
      "COWELL COLLEGE INFILL APTS": { lat: 36.9965, lng: -122.0540 },
      "PORTER COLLEGE": { lat: 36.9942, lng: -122.0654 }
    };

    console.log(`Looking for coordinates for location: ${location}`);
    
    // Try to find matching coordinates
    for (const [key, coords] of Object.entries(locationCoords)) {
      if (location.includes(key)) {
        console.log(`Found coordinates for ${location}: `, coords);
        return coords;
      }
    }
    
    console.warn(`No coordinates found for location: ${location}`);
    return null;
  }

  // Load the map when the page loads
  window.initMap = initMap;
	
	const firebaseConfig = {
  apiKey: "AIzaSyAgYdoZnSv5ekxngv_ue61aFZUGcRlphok",
  authDomain: "defundtaps.firebaseapp.com",
  projectId: "defundtaps",
  storageBucket: "defundtaps.appspot.com",
  messagingSenderId: "456064481827",
  appId: "1:456064481827:web:4a4b37035fbfbd534ccf96",
  measurementId: "G-4ZX480FN46"
};

firebase.initializeApp(firebaseConfig);

/* ───────── initialise Firebase auth session ───────── */
/* ───────── initialise Firebase auth session (safe version) ───────── */
function init () {
  /* Wait for Firebase to tell us whether a user is already persisted    *
   * before we create a new anonymous one.                              */
  firebase.auth().onAuthStateChanged(async user => {
    if (user) return;                       // a real account or anon already there

    try {
      await firebase.auth().signInAnonymously();
      console.log('Anonymous session started');
    } catch (err) {
      console.warn('Anon sign‑in skipped:', err.code, err.message);
    }
  });
}
window.addEventListener('DOMContentLoaded', init);



var db = firebase.firestore();

// Add auth state listener
/* ───────── AUTH LISTENER ───────── */
/* ───────── MASTER AUTH LISTENER ───────── */
firebase.auth().onAuthStateChanged(async function (user) {

  /* 0.  completely signed‑out ► reset UI */
  if (!user) {
    ['userFullName','userEmail','userLicensePlate','finishedSetup']
      .forEach(eraseCookie);
    resetAccountSection();
    return;
  }

  /* 1.  anonymous session ► leave main UI alone, just keep map/data */
  if (user.isAnonymous) {
    fetchSightings();            // still need the public data
    return;                      // ■■■  <‑‑ EARLY EXIT  ■■■
  }

  /* 2.  real (email/password) account ► load profile + tickets */
  try {
    const snap = await db.collection('users').doc(user.uid).get();
    if (!snap.exists) throw new Error('No profile in /users');

    const profile   = snap.data();
    const fullName  = profile.fullName     || '';
    const email     = profile.email        || '';
    const plate     = profile.licensePlate || '';

    /* cookies for later */
    setCookie('userFullName', fullName, 30);
    setCookie('userEmail',    email,    30);
    setCookie('userLicensePlate', plate,30);

    /* finishedSetup?  — look for tickets in /current_users  */
    let setup = getCookie('finishedSetup');          // '' | 'done'
    if (!setup) {
      const cur = await db.collection('current_users')
                          .where('email','==',email).limit(1).get();
      if (!cur.empty && (cur.docs[0].data().tickets||[]).length) {
        setup = 'done';
        setCookie('finishedSetup','done',30);
      }
    }

    /* build UI + inject tickets */
    showAccountSection(fullName, plate, setup);
    loadUserTickets(email);

  } catch (err) {
    console.error('Auth listener failed:', err);
    resetAccountSection();
  }
});


  
  
let allSightings = [];
let showingAll = false;
var days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
];




window.addEventListener('DOMContentLoaded', (event) => {
    const now = new Date();

    // Formatting for date-time input
    const formattedDate = now.getFullYear() + '-' +
        (now.getMonth() + 1).toString().padStart(2, '0') + '-' +
        now.getDate().toString().padStart(2, '0');

    const formattedTime = now.getHours().toString().padStart(2, '0') + ':' +
        now.getMinutes().toString().padStart(2, '0');

    // Existing code to set the date
    document.getElementById('timeOccurred').value = formattedDate + 'T' + formattedTime;

    // New code to set the time
    document.getElementById('predictionTime').value = formattedTime;
});



window.addEventListener('DOMContentLoaded', (event) => {
    const now = new Date();

    const formattedDateTime = now.getFullYear() + '-' +
        (now.getMonth() + 1).toString().padStart(2, '0') + '-' +
        now.getDate().toString().padStart(2, '0') + 'T' +
        now.getHours().toString().padStart(2, '0') + ':' +
        now.getMinutes().toString().padStart(2, '0');

    document.getElementById('timeOccurred').value = formattedDateTime;

    // ...rest of your code
});



const now = new Date();
let currentDay = days[now.getDay()];
//document.getElementById(currentDay).style.backgroundColor = "#3797F0";
//document.getElementById("now_show").innerHTML=currentDay;

let dropped = false;
var forecastMap;


let map2;

       
		
		
var colleges = [


	{ name: "101 HAHN STUDENT SERVICES", lat: 36.9951142, lng: -122.0571824 },
{ name: "102 QUARRY PLAZA", lat: 36.99740550000001, lng: -122.0555969 },
{ name: "103A EAST FIELD HOUSE", lat: 36.9949906, lng: -122.0552532 },
{ name: "104 EAST REMOTE", lat: 36.9910014, lng: -122.0530383 },
{ name: "106 COWELL COLLEGE", lat: 36.9983043, lng: -122.0539247 },
{ name: "107 COWELL - STEVENSON", lat: 36.9979251, lng: -122.053208 },
{ name: "108 STEVENSON SERVICE ROAD", lat: 36.9975782, lng: -122.0528694 },
{ name: "109 STEVENSON COLLEGE", lat: 36.9982315, lng: -122.0526854 },
{ name: "110 STEVENSON COLLEGE", lat: 36.9982416, lng: -122.0516104 },
{ name: "111A CROWN COLLEGE PIT", lat: 37.0011036, lng: -122.0544011 },
{ name: "112 CORE WEST STRUCTURE", lat: 36.982864, lng: -122.059665 },
{ name: "113 THIMANN LAB", lat: 36.9981862, lng: -122.0626035 },
{ name: "114 JOHN R. LEWIS COLLEGE", lat: 37.0001383, lng: -122.0589531 },
{ name: "115 CARRIAGE HOUSE", lat: 36.9803541, lng: -122.0519273 },
{ name: "116 CAMPUS FACILITIES", lat: 36.98101, lng: -122.051872 },
{ name: "119 MERRILL COLLEGE", lat: 36.999685, lng: -122.0517469 },
{ name: "120A LOWER MCHENRY LIBRARY", lat: 36.9962993, lng: -122.0591676 },
{ name: "121 BIOMED - SCIENCE LIBRARY", lat: 36.9910462, lng: -122.0531602 },
{ name: "124 PORTER COLLEGE", lat: 36.99438689999999, lng: -122.0641388 },
{ name: "125 PORTER COLLEGE", lat: 36.9938063, lng: -122.0647358 },
{ name: "126 PERFORMING ARTS", lat: 36.9933961, lng: -122.061554 },
{ name: "127 WEST REMOTE", lat: 36.9885555, lng: -122.0659006 },
{ name: "128 HEALTH CENTER", lat: 36.9991449, lng: -122.0582145 },
{ name: "130 FAMILY STUDENT HOUSING - 200 LOO", lat: 36.9990766, lng: -122.0636772 },
{ name: "131 FAMILY STUDENT HOUSING - 300 LOO", lat: 36.9911955, lng: -122.0677039 },
{ name: "133 FAMILY STUDENT HOUSING - 500 LOO", lat: 36.9912085, lng: -122.0684344 },
{ name: "134 FAMILY STUDENT HOUSING - 600 LOO", lat: 36.9905962, lng: -122.0687845 },
{ name: "135 FAMILY STUDENT HOUSING - 700 LOO", lat: 36.99188000000001, lng: -122.0676825 },
{ name: "136 FAMILY STUDENT HOUSING - 800 LOO", lat: 36.9925845, lng: -122.0675816 },
{ name: "138 BASKIN ENGINEERING", lat: 37.0002252, lng: -122.063895 },
{ name: "139B COMMUNICATIONS", lat: 37.0006455, lng: -122.0620968 },
{ name: "140 FOUNDRY", lat: 36.9957364, lng: -122.0616349 },
{ name: "141 KERR HALL", lat: 36.9964885, lng: -122.0616788 },
{ name: "143 KRESGE COLLEGE", lat: 36.9970729, lng: -122.0670583 },
{ name: "144 OAKES COLLEGE", lat: 36.9910462, lng: -122.0531602 },
{ name: "145 KRESGE COLLEGE", lat: 36.997283, lng: -122.0672385 },
{ name: "146 RACHEL CARSON COLLEGE", lat: 36.9922892, lng: -122.0645075 },
{ name: "147 KRESGE COLLEGE", lat: 36.99682180000001, lng: -122.0653125 },
{ name: "149 HELLER EXTENSION", lat: 36.979712, lng: -122.0535782 },
{ name: "150A NORTH PERIMETER", lat: 37.0025371, lng: -122.0659824 },
{ name: "152 CROWN - MERRILL APARTMENTS", lat: 37.0021419, lng: -122.0535165 },
{ name: "153 CROWN - MERRILL APARTMENTS", lat: 37.0021345, lng: -122.0542498 },
{ name: "154 CROWN - MERRILL APARTMENTS", lat: 37.0021967, lng: -122.0548183 },
{ name: "155 CROWN - MERRILL APARTMENTS", lat: 36.982864, lng: -122.059665 }


];




// New function to update the dropdown selection
function selectLocation(collegeName) {
    const selectElement = document.getElementById("collegeLocation");
    // Find the option with the matching value and select it
    for (let option of selectElement.options) {
        if (option.value === collegeName) {
            option.selected = true;
            break;
        }
    }
    // Trigger any change event associated with the selection if needed
    selectElement.dispatchEvent(new Event('change'));
}




/*
function reportSighting(collegeName, markerPosition) {
    const confirmation = window.confirm(
        `Do you want to report a TAPS sighting at ${collegeName}?`
    );
    if (confirmation) {
        const userId = firebase.auth().currentUser.uid;
        db.collection("sightings").add({
            uid: userId,
            college: collegeName,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        });
        fetchSightings();
    }
}
*/



function reportSighting(collegeName) {
    // Store collegeName globally or in a way that submitCitation can access
    window.currentCollege = collegeName;

    // Show the form for entering the citation date and time
    document.getElementById('citationDateTimeForm').style.display = 'block';
}



function populateLocationDropdown() {
    const selectElement = document.getElementById("collegeLocation");
    colleges.forEach(college => {
        const option = document.createElement("option");
        option.value = college.name;
        option.textContent = college.name;
        selectElement.appendChild(option);
    });
}

// Call the function to populate the dropdown after defining it
populateLocationDropdown();


function toTitleCase(str) {
  return str
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());   // every word ⇒ capital first letter
}




async function submitCitation() {
            const citationNumber = document.getElementById('citationNumber').value || "Unavailable";
            const licensePlate = document.getElementById('licensePlate').value || "Unavailable";
            const selectedCollegeName = document.getElementById('collegeLocation').value;
            const timeOccurredStr = document.getElementById('timeOccurred').value;

            const date = new Date(timeOccurredStr);
            const utcDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
            const formattedTimeOccurred = utcDate.toISOString().slice(0, 19) + 'Z';

            const postData = {
                citationNumber: citationNumber,
                licensePlate: licensePlate,
                locationOccurred: selectedCollegeName,
                timeOccurred: formattedTimeOccurred
            };
			
            try {
                const response = await fetch('https://taps-2-0.onrender.com/api/citations', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(postData)
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                console.log("Citation submitted successfully to Heroku!");

                await db.collection("bruh").add({
                    citationNumber: citationNumber,
                    //college: selectedCollegeName,
                    //time: formattedTimeOccurred,
                    licensePlate: licensePlate // Include the license plate info
                });

                alert("Citation submitted successfully");
                console.log("Citation submitted successfully to Firebase!");
            } catch (error) {
                console.error("Error submitting citation:", error);
            }
        }

function days_dropdown(){
	
	/*
    let elem = document.getElementById("days_show");
    if(dropped){
        elem.style.display = "none";
    }else{
        elem.style.display = "block";
    }
    dropped = !dropped;
	
	*/
    
}







/*
function toggleSightings() {
    showingAll = !showingAll;
    displaySightings();
    document.querySelector("button").textContent = showingAll
        ? "Show less"
        : "Show more";
}
*/



















async function fetchSightings() {
    // Example data array
    const dataArray = [
	
	"24pk501373,104 EAST REMOTE,0251,9/3/2024",
"377124351,164 JOHN R. LEWIS COLLEGE,0209,3/22/2023",
"388124545,164 JOHN R. LEWIS COLLEGE,0300,3/24/2023",
"399126879,166 COLLEGE NINE,1114,5/1/2023",
"399127353,166 COLLEGE NINE,1009,5/11/2023",
"377125740,166 COLLEGE NINE,0504,5/11/2023",
"399128114,164 JOHN R. LEWIS COLLEGE,1046,6/7/2023",
"388127774,147 KRESGE COLLEGE,1128,9/13/2023",
"377128895,PORTER-KRESGE ROAD,0451,10/28/2023",
"388129789,145 KRESGE COLLEGE,0920,11/9/2023",
"388130371,147 KRESGE COLLEGE,1004,11/29/2023",
"388130462,KRESGE COLLEGE,0832,12/4/2023",
"411126003,112 CORE WEST STRUCTURE,0124,2/26/2024",
"377130730,PORTER-KRESGE ROAD,1058,3/14/2024",
"24pk501373,104 EAST REMOTE,0251,9/3/2024",
        "24pk200039,15169,0539,6/5/2024",
"24pk400104,162 OAKES COLLEGE,0820,6/5/2024",
"377128800,RACHEL CARSON SERVICE ROAD,1206,10/26/2023",
"411123484,RACHEL CARSON COLLEGE,1117,11/4/2023",
"433123881,162 OAKES COLLEGE,1011,11/7/2023",
"433124241,162 OAKES COLLEGE,1158,11/21/2023",
"433124426,STEINHART WAY,0150,11/30/2023",
"411123824,STEINHART WAY,0251,12/5/2023",
"377129444,107 COWELL - STEVENSON,1235,1/6/2024",
"411124765,162 OAKES COLLEGE,1217,1/22/2024",
"388132433,162 OAKES COLLEGE,0819,2/20/2024",
"388133120,162 OAKES COLLEGE,0253,3/11/2024",
"411126512,125 PORTER COLLEGE,0458,3/11/2024",
"422123975,162 OAKES COLLEGE,1253,5/10/2024",
        "366123531,119 MERRILL COLLEGE,1012,10/30/2019",
"366123741,112 CORE WEST STRUCTURE,1458,11/18/2019",
"366123806,STEINHART WAY,1025,11/21/2019",
"366123881,CROWN SERVICE ROAD,1235,11/27/2019",
"366123917,162 OAKES COLLEGE,1106,12/2/2019",
"366123927,126 PERFORMING ARTS,1243,12/2/2019",
"366124228,136 FAMILY STUDENT HOUSING - 800 LOO,1100,12/23/2019",
"366124336,103A EAST FIELD HOUSE,1445,1/9/2020",
"366124439,124 PORTER COLLEGE,1403,1/15/2020",
"366124497,107 COWELL - STEVENSON,0737,1/18/2020",
"366124794,104 EAST REMOTE,1234,1/31/2020",
"366124796,104 EAST REMOTE,1245,1/31/2020",
"366124972,127 WEST REMOTE,0729,2/19/2020",
"366125022,104 EAST REMOTE,1234,2/24/2020",
"366125048,162 OAKES COLLEGE,1237,2/25/2020",
"366125144,102 QUARRY PLAZA,1454,3/4/2020",
"366125215,165 COLLEGE TEN,0919,3/10/2020",
"366125423,COWELL COLLEGE,1706,7/23/2020",
"366125513,ENGINEERING LIBRARY,0834,9/23/2020",
"366125517,134 FAMILY STUDENT HOUSING - 600 LOO,9:53 AM,9/23/2020",
"366125521,102 QUARRY PLAZA,1259,9/24/2020",
"366125666,134 FAMILY STUDENT HOUSING - 600 LOO,0937,11/2/2020",
"366125667,134 FAMILY STUDENT HOUSING - 600 LOO,0940,11/2/2020",
"366125696,127 WEST REMOTE,0720,11/10/2020",
"366125854,COOLIDGE DRIVE,1544,12/22/2020",
"366126113,134 FAMILY STUDENT HOUSING - 600 LOO,0744,2/19/2021",
"366126302,150B NORTH PERIMITER,1605,3/10/2021",
"366126310,119 MERRILL COLLEGE,1053,3/11/2021",
"366126404,136 FAMILY STUDENT HOUSING - 800 LOO,0832,3/25/2021",
"366126443,104 EAST REMOTE,0916,4/1/2021",
"366126485,127 WEST REMOTE,1358,4/2/2021",
"366126631,112 CORE WEST STRUCTURE,1139,4/15/2021",
"366126653,156 FIRE HOUSE,1207,4/16/2021",
"366126718,112 CORE WEST STRUCTURE,1250,4/21/2021",
"366126918,156 FIRE HOUSE,1207,5/11/2021",
"366126928,109 STEVENSON COLLEGE,1635,5/11/2021",
"366127011,103A EAST FIELD HOUSE,1545,5/18/2021",
"366127109,112 CORE WEST STRUCTURE,1225,5/28/2021",
"366127169,102 QUARRY PLAZA,1240,6/3/2021",
"366127191,114 SOCIAL SCIENCES,0954,6/4/2021",
"366127216,125 PORTER COLLEGE,1147,6/18/2021",
"366127256,143 KRESGE COLLEGE,0951,7/2/2021",
"366127374,127 WEST REMOTE,0929,7/9/2021",
"366127436,102 QUARRY PLAZA,1200,7/15/2021",
"366127484,149 HELLER EXTENSION,1036,7/22/2021",
"366127699,103B  OPERS - RESTRICTED,1236,8/19/2021",
"366127797,126 PERFORMING ARTS,1331,9/2/2021",
"366127827,102 QUARRY PLAZA,1248,9/8/2021",
"366128034,124 PORTER COLLEGE,0954,9/25/2021",
"366128047,107 COWELL - STEVENSON,1056,9/25/2021",
"366128086,160 OAKES COLLEGE,0819,9/30/2021",
"366128096,124 PORTER COLLEGE,0856,9/30/2021",
"366128131,107 COWELL - STEVENSON,0805,10/1/2021",
"366128204,110 STEVENSON COLLEGE,1015,10/2/2021",
"366128226,139A ENGINEERING II,0921,10/6/2021",
"366128227,166 COLLEGE NINE,0944,10/6/2021",
"366128261,109 STEVENSON COLLEGE,1426,10/6/2021",
"366128306,139A ENGINEERING II,1132,10/7/2021",
"366128344,126 PERFORMING ARTS,1611,10/7/2021",
"366128463,124 PORTER COLLEGE,1440,10/15/2021",
"366128504,124 PORTER COLLEGE,0831,10/16/2021",
"366128507,124 PORTER COLLEGE,0835,10/16/2021",
"366128573,107 COWELL - STEVENSON,1004,10/20/2021",
"366128654,124 PORTER COLLEGE,0831,10/22/2021",
"366128699,124 PORTER COLLEGE,0854,10/23/2021",
"366128755,124 PORTER COLLEGE,0856,10/27/2021",
"366128757,124 PORTER COLLEGE,0900,10/27/2021",
"366128773,112 CORE WEST STRUCTURE,1135,10/27/2021",
"366128827,108 STEVENSON SERVICE ROAD,1357,10/28/2021",
"366129189,103A EAST FIELD HOUSE,0918,11/12/2021",
"366129374,162 OAKES COLLEGE,1408,11/18/2021",
"366129440,103A EAST FIELD HOUSE,1342,11/19/2021",
"366129739,101 HAHN STUDENT SERVICES,0824,12/8/2021",
"366129837,112 CORE WEST STRUCTURE,1518,12/8/2021",
"366129869,164 COLLEGE TEN,0837,12/9/2021",
"366130096,103A EAST FIELD HOUSE,1127,1/18/2022",
"366130271,101 HAHN STUDENT SERVICES,1216,1/25/2022",
"366130301,147 KRESGE COLLEGE,0905,1/26/2022",
"366130391,120A LOWER MCHENRY LIBRARY,1606,1/27/2022",
"366130427,107 COWELL - STEVENSON,1002,2/1/2022",
"366130679,108 STEVENSON SERVICE ROAD,1509,2/3/2022",
"366130814,112 CORE WEST STRUCTURE,1528,2/9/2022",
"366130820,112 CORE WEST STRUCTURE,1551,2/9/2022",
"366130853,103A EAST FIELD HOUSE,1237,2/10/2022",
"366130865,165 COLLEGE TEN,1413,2/10/2022",
"366130900,112 CORE WEST STRUCTURE,1441,2/11/2022",
"366130907,150A NORIMITER,0922,2/15/2022",
"366130952,126 PERFORMING ARTS,1105,2/15/2022",
"366130960,126 PERFORMING ARTS,1121,2/15/2022",
"366131026,107 COWELL - STEVENSON,1209,2/16/2022",
"366131108,103A EAST FIELD HOUSE,1248,2/17/2022",
"366131297,108 STEVENSON SERVICE ROAD,1526,2/23/2022",
"366131353,109 STEVENSON COLLEGE,1159,2/24/2022",
"366131363,107 COWELL - STEVENSON,1221,2/24/2022",
"366131595,126 PERFORMING ARTS,1604,3/2/2022",
"366131811,101 HAHN STUDENT SERVICES,1205,3/10/2022",
"366131928,124 PORTER COLLEGE,1142,3/15/2022",
"366131951,165 COLLEGE TEN,1442,3/15/2022",
"366132068,STEVENSON SERVICE ROAD,1654,3/23/2022",
"366132400,152 CROWN - MERRILL APARTMENTS,0916,4/7/2022",
"366132438,165 COLLEGE TEN,1449,4/7/2022",
"366132449,164 COLLEGE TEN,1547,4/7/2022",
"366132644,112 CORE WEST STRUCTURE,1506,4/13/2022",
"366132665,157 GRADUATE STUDENT APARTMENTS,1646,4/13/2022",
"366132767,147 KRESGE COLLEGE,1553,4/15/2022",
"366132774,139A ENGINEERING II,1625,4/15/2022",
"366133160,107 COWELL - STEVENSON,1230,4/27/2022",
"366133182,108 STEVENSON SERVICE ROAD,1535,4/27/2022",
"366133198,114 SOCIAL SCIENCES,0922,4/28/2022",
"366133259,162 OAKES COLLEGE,1543,4/28/2022",
"366133260,162 OAKES COLLEGE,1545,4/28/2022",
"366133326,124 PORTER COLLEGE,1027,5/4/2022",
"366133407,124 PORTER COLLEGE,1100,5/5/2022",
"366133513,108 STEVENSON SERVICE ROAD,0745,5/11/2022",
"366133516,162 OAKES COLLEGE,1323,5/11/2022",
"366133549,LEONARDO LANE,0800,5/12/2022",
"366133649,LEONARDO LANE,0914,5/13/2022",
"366133659,139A ENGINEERING II,1006,5/13/2022",
"366133685,126 PERFORMING ARTS,1525,5/13/2022",
"366133869,143 KRESGE COLLEGE,0931,5/19/2022",
"366133894,107 COWELL - STEVENSON,1201,5/19/2022",
"366133896,STEVENSON SERVICE ROAD,1246,5/19/2022",
"366133999,162 OAKES COLLEGE,0813,5/23/2022",
"366134022,162 OAKES COLLEGE,0842,5/23/2022",
"366134074,120A LOWER MCHENRY LIBRARY,1425,5/23/2022",
"366134171,143 KRESGE COLLEGE,0840,5/25/2022",
"366134214,LEONARDO LANE,0812,5/26/2022",
"366134333,108 STEVENSON SERVICE ROAD,0756,6/1/2022",
"366134351,162 OAKES COLLEGE,0852,6/1/2022",
"366134396,149 HELLER EXTENSION,1119,6/1/2022",
"366134551,150A NORIMITER,1039,6/8/2022",
"366134778,125 PORTER COLLEGE,1418,7/14/2022",
"366134858,139B COMMUNICATIONS,1134,7/20/2022",
"366134905,111B CROWN COLLEGE CIRCLE,1339,7/25/2022",
"366135124,112 CORE WEST STRUCTURE,1135,8/16/2022",
"366135134,125 PORTER COLLEGE,1543,8/16/2022",
"366135173,102 QUARRY PLAZA,1457,8/18/2022",
"366135217,125 PORTER COLLEGE,1116,8/23/2022",
"366135291,146 RACHEL CARSON COLLEGE,1016,8/29/2022",
"366135346,125 PORTER COLLEGE,1451,8/30/2022",
"366135412,166 COLLEGE NINE,1414,9/7/2022",
"366135424,162 OAKES COLLEGE,0812,9/12/2022",
"366135447,139A ENGINEERING II,1146,9/12/2022",
"366135672,112 CORE WEST STRUCTURE,1003,9/27/2022",
"366135722,112 CORE WEST STRUCTURE,1118,9/27/2022",
"366135760,126 PERFORMING ARTS,1550,9/27/2022",
"366135850,128 HEALTH CENTER,1403,10/3/2022",
"366135938,112 CORE WEST STRUCTURE,1536,10/4/2022",
"366135970,149 HELLER EXTENSION,0958,10/5/2022",
"366135971,149 HELLER EXTENSION,1004,10/5/2022",
"366135981,111A CROWN COLLEGE PIT,1116,10/5/2022",
"366136026,147 KRESGE COLLEGE,0837,10/6/2022",
"366136069,164 COLLEGE TEN,1056,10/6/2022",
"366136188,126 PERFORMING ARTS,1453,10/10/2022",
"366136196,126 PERFORMING ARTS,1505,10/10/2022",
"366136231,111A CROWN COLLEGE PIT,1013,10/11/2022",
"366136343,149 HELLER EXTENSION,1103,10/12/2022",
"366136393,156 FIRE HOUSE,0959,10/13/2022",
"366136405,111A CROWN COLLEGE PIT,1030,10/13/2023",
"366136464,143 KRESGE COLLEGE,1544,10/13/2023",
"366136478,LEONARDO LANE,0839,10/17/2023",
"366136690,103A EAST FIELD HOUSE,0900,10/27/2023",
"366136712,162 OAKES COLLEGE,1055,10/27/2023",
"366136735,112 CORE WEST STRUCTURE,1225,10/27/2023",
"366136803,103A EAST FIELD HOUSE,1458,10/31/2023",
"366136838,112 CORE WEST STRUCTURE,1126,11/1/2023",
"366136856,107 COWELL - STEVENSON,1455,11/1/2023",
"366136883,109 STEVENSON COLLEGE,1553,11/1/2023",
"366136939,147 KRESGE COLLEGE,1508,11/2/2023",
"366137076,164 COLLEGE TEN,1510,11/7/2023",
"366137082,158 REDWOOD GROVE APARTMENTS,0916,11/8/2023",
"366137143,143 KRESGE COLLEGE,1437,11/8/2023",
"366137170,158 REDWOOD GROVE APARTMENTS,0821,11/15/2023",
"377123458,119 MERRILL COLLEGE,0957,2/14/2024",
"377123489,164 COLLEGE TEN,1229,2/15/2024",
"377123653,162 OAKES COLLEGE,1019,2/22/2024",
"377123654,162 OAKES COLLEGE,1023,2/22/2024",
"377123655,146 RACHEL CARSON COLLEGE,1042,2/22/2024",
"377123720,103A EAST FIELD HOUSE,0954,2/23/2024",
"377123740,109 STEVENSON COLLEGE,1424,2/23/2024",
"377123944,109 STEVENSON COLLEGE,1310,3/7/2024",
"377123949,109 STEVENSON COLLEGE,1331,3/7/2024",
"377123963,119 MERRILL COLLEGE,1446,3/7/2024",
"377123985,111A CROWN COLLEGE PIT,1705,3/7/2024",
"377123988,111A CROWN COLLEGE PIT,1716,3/7/2024",
"377123997,111A CROWN COLLEGE PIT,1738,3/7/2024",
"377124857,109 STEVENSON COLLEGE,1449,4/11/2024",
"377125137,164 JOHN R. LEWIS COLLEGE,1946,4/18/2024",
"377125145,139A ENGINEERING II,1348,4/19/2024",
"377125201,162 OAKES COLLEGE,1142,4/20/2024",
"377125208,162 OAKES COLLEGE,1207,4/20/2024",
"377125251,119 MERRILL COLLEGE,1817,4/20/2024",
"377125309,150A NORIMETER,1509,4/21/2024",
"377125317,152 CROWN - MERRILL APARTMENTS,1737,4/21/2024",
"377125341,139A ENGINEERING II,1240,4/25/2024",
"377125407,162 OAKES COLLEGE,1500,4/26/2024",
"377125411,162 OAKES COLLEGE,1513,4/26/2024",
"377125449,111A CROWN COLLEGE PIT,1253,4/27/2024",
"377125543,165 JOHN R. LEWIS COLLEGE,1214,4/28/2024",
"377125596,139A ENGINEERING II,1406,5/9/2024",
"377125632,146 RACHEL CARSON COLLEGE,1846,5/9/2024",
"377125646,162 OAKES COLLEGE,1203,5/10/2024",
"377125678,162 OAKES COLLEGE,1442,5/10/2024",
"377125686,146 RACHEL CARSON COLLEGE,1544,5/10/2024",
"377125716,124 PORTER COLLEGE,1518,5/11/2024",
"377125751,125 PORTER COLLEGE,1217,5/12/2024",
"377125779,126 PERFORMING ARTS,1427,5/12/2024",
"377125833,110 STEVENSON COLLEGE,1234,5/16/2024",
"377125872,108 STEVENSON SERVICE ROAD,2020,5/16/2024",
"377125967,111A,1503,5/18/2024",
"377125975,111A,1524,5/18/2024",
"377126037,103A EAST FIELD HOUSE,1553,5/19/2024",
"377126041,103A EAST FIELD HOUSE,1608,5/19/2024",
"377126058,119 MERRILL COLLEGE,1903,5/19/2024",
"377126164,160 OAKES COLLEGE,1502,5/24/2024",
"377126176,121 BIOMED - SCIENCE LIBRARY,1247,5/30/2024",
"377126207,111A CROWN COLLEGE PIT,1733,5/30/2024",
"377126233,111A CROWN COLLEGE PIT,1834,5/30/2024",
"377126259,119 MERRILL COLLEGE,1459,5/31/2024",
"377126270,119 MERRILL COLLEGE,1546,5/31/2024",
"377126337,126 PERFORMING ARTS,1526,6/1/2024",
"377126386,139B COMMUNICATIONS,2014,6/1/2024",
"377126448,107 COWELL - STEVENSON,1206,6/6/2024",
"377126471,113 THIMANN LAB,1447,6/6/2024",
"377126487,112 CORE WEST STRUCTURE,1548,6/6/2024",
"377126534,162 OAKES COLLEGE,1234,6/7/2024",
"377126540,162 OAKES COLLEGE,1259,6/7/2024",
"377126546,160 OAKES COLLEGE,1329,6/7/2024",
"377126677,120B UPPER MCHENRY LIBRARY - RESTRIC,1740,6/8/2024",
"377126835,111A CROWN COLLEGE PIT,1445,6/13/2024",
"377126854,111A CROWN COLLEGE PIT,1537,6/13/2024",
"377126965,OAKES COLLEGE,1137,6/16/2024",
"377126976,144 OAKES COLLEGE,2010,6/16/2024",
"377127221,111A CROWN COLLEGE PIT,1830,7/6/2024",
"377127240,104 EAST REMOTE,1215,7/7/2024",
"377127345,103A EAST FIELD HOUSE,1934,7/12/2024",
"377127371,150A NORTH PERIMETER,1452,7/13/2024",
"377127425,150B NORTH PERIMETER,1155,7/19/2024",
"377127435,150A NORTH PERIMETER,1544,7/19/2024",
"377127450,126 PERFORMING ARTS,1027,7/20/2024",
"377127563,150A NORTH PERIMETER,1230,7/26/2024",
"377127576,165 JOHN R. LEWIS COLLEGE,1640,7/26/2024",
"377127594,107 COWELL - STEVENSON,1136,7/27/2024",
"377127610,109 STEVENSON COLLEGE,0845,7/28/2024",
"377127621,103A EAST FIELD HOUSE,1057,7/28/2024",
"377127629,HAGAR DRIVE,1455,7/28/2024",
"377127700,166 COLLEGE NINE,1004,8/3/2024",
"377127736,120A LOWER MCHENRY LIBRARY,1153,8/4/2024",
"377127742,152 CROWN - MERRILL APARTMENTS,1254,8/4/2024",
"377127743,152 CROWN - MERRILL APARTMENTS,1257,8/4/2024",
"377127744,152 CROWN - MERRILL APARTMENTS,1301,8/4/2024",
"377127745,152 CROWN - MERRILL APARTMENTS,1306,8/4/2024",
"377127748,112 CORE WEST STRUCTURE,1627,8/4/2024",
"377127754,101 HAHN STUDENT SERVICES,1108,8/5/2024",
"377127761,166 COLLEGE NINE,1454,8/5/2024",
"377127762,165 JOHN R. LEWIS COLLEGE,1516,8/5/2024",
"377127763,121 BIOMED - SCIENCE LIBRARY,1530,8/5/2024",
"377127765,125 PORTER COLLEGE,1634,8/5/2024",
"377127773,107 COWELL - STEVENSON,1931,8/5/2024",
"377127774,106 COWELL COLLEGE,1938,8/5/2024",
"377127777,163 COWELL PROVOST,2005,8/5/2024",
"377127778,162 OAKES COLLEGE,0856,8/9/2024",
"377127784,125 PORTER COLLEGE,1022,8/9/2024",
"377127787,126 PERFORMING ARTS,1101,8/9/2024",
"377127793,126 PERFORMING ARTS,1135,8/9/2024",
"377127795,120B UPPER MCHENRY LIBRARY - RESTRIC,1204,8/9/2024",
"377127796,120B UPPER MCHENRY LIBRARY - RESTRIC,1207,8/9/2024",
"377127797,120B UPPER MCHENRY LIBRARY - RESTRIC,1209,8/9/2024",
"377127798,120B UPPER MCHENRY LIBRARY - RESTRIC,1213,8/9/2024",
"377127799,120B UPPER MCHENRY LIBRARY - RESTRIC,1215,8/9/2024",
"377127804,113 THIMANN LAB,1338,8/9/2024",
"377127809,150A NORTH PERIMETER,1542,8/9/2024",
"377127811,150A NORTH PERIMETER,1548,8/9/2024",
"377127815,102 QUARRY PLAZA,0853,8/10/2024",
"377127816,101 HAHN STUDENT SERVICES,0925,8/10/2024",
"377127817,101 HAHN STUDENT SERVICES,0929,8/10/2024",
"377127825,109 STEVENSON COLLEGE,1058,8/10/2024",
"377127826,109 STEVENSON COLLEGE,1100,8/10/2024",
"377127827,109 STEVENSON COLLEGE,1102,8/10/2024",
"377127828,109 STEVENSON COLLEGE,1105,8/10/2024",
"377127833,139A ENGINEERING II,1327,8/10/2024",
"377127834,139A ENGINEERING II,1337,8/10/2024",
"377127843,119 MERRILL COLLEGE,0959,8/11/2024",
"377127844,119 MERRILL COLLEGE,1003,8/11/2024",
"377127845,119 MERRILL COLLEGE,1008,8/11/2024",
"377127852,COLLEGE NINE,1114,8/11/2024",
"377127854,112 CORE WEST STRUCTURE,1154,8/11/2024",
"377127860,121 BIOMED - SCIENCE LIBRARY,1520,8/11/2024",
"377127862,104 EAST REMOTE,1607,8/11/2024",
"377127863,104 EAST REMOTE,1623,8/11/2024",
"377127870,152 CROWN - MERRILL APARTMENTS,1048,8/12/2024",
"377127871,152 CROWN - MERRILL APARTMENTS,1052,8/12/2024",
"377127872,152 CROWN - MERRILL APARTMENTS,1055,8/12/2024",
"377127874,155 CROWN - MERRILL APARTMENTS,1111,8/12/2024",
"377127875,154 CROWN - MERRILL APARTMENTS,1114,8/12/2024",
"377127877,107 COWELL - STEVENSON,1139,8/12/2024",
"377127883,126 PERFORMING ARTS,1551,8/12/2024",
"377127887,162 OAKES COLLEGE,0933,8/17/2024",
"377127888,FAMILY STUDENT HOUSING,0950,8/17/2024",
"377127893,126 PERFORMING ARTS,1122,8/17/2024",
"377127897,139B COMMUNICATIONS,1330,8/17/2024",
"377127902,128 HEALTH CENTER,1557,8/17/2024",
"377127904,139A ENGINEERING II,1615,8/17/2024",
"377127908,138 BASKIN ENGINEERING,0931,8/18/2024",
"377127914,112 CORE WEST STRUCTURE,1123,8/18/2024",
"377127924,104 EAST REMOTE,1342,8/18/2024",
"377127925,104 EAST REMOTE,1349,8/18/2024",
"377127930,124 PORTER COLLEGE,447,8/18/2024",
"377127932,165 JOHN R. LEWIS COLLEGE,0921,8/19/2024",
"377127933,165 JOHN R. LEWIS COLLEGE,0922,8/19/2024",
"377127934,165 JOHN R. LEWIS COLLEGE,0925,8/19/2024",
"377127936,165 JOHN R. LEWIS COLLEGE,0931,8/19/2024",
"377127938,165 JOHN R. LEWIS COLLEGE,0935,8/19/2024",
"377127939,165 JOHN R. LEWIS COLLEGE,0937,8/19/2024",
"377127953,152 CROWN - MERRILL APARTMENTS,1051,8/19/2024",
"377127954,152 CROWN - MERRILL APARTMENTS,1056,8/19/2024",
"377127955,CROWN APARTMENTS,1100,8/19/2024",
"377127956,152 CROWN - MERRILL APARTMENTS,1104,8/19/2024",
"377127958,152 CROWN - MERRILL APARTMENTS,1111,8/19/2024",
"377127964,153 CROWN - MERRILL APARTMENTS,1131,8/19/2024",
"377127966,154 CROWN - MERRILL APARTMENTS,1142,8/19/2024",
"377127971,121 BIOMED - SCIENCE LIBRARY,1327,8/19/2024",
"377127973,103A EAST FIELD HOUSE,1527,8/19/2024",
"377127978,103A EAST FIELD HOUSE,1554,8/19/2024",
"377127981,163 COWELL PROVOST,1610,8/19/2024",
"377127989,150B NORTH PERIMETER,0928,8/23/2024",
"377127991,150B NORTH PERIMETER,0932,8/23/2024",
"377127992,150B NORTH PERIMETER,0942,8/23/2024",
"377127996,150B NORTH PERIMETER,0955,8/23/2024",
"377128002,112 CORE WEST STRUCTURE,1321,8/23/2024",
"377128005,112 CORE WEST STRUCTURE,1345,8/23/2024",
"377128006,139A ENGINEERING II,1553,8/23/2024",
"377128007,139A ENGINEERING II,1557,8/23/2024",
"377128011,139A ENGINEERING II,1613,8/23/2024",
"377128012,139A ENGINEERING II,1618,8/23/2024",
"377128014,108 STEVENSON SERVICE ROAD,0855,8/24/2024",
"377128015,109 STEVENSON COLLEGE,0908,8/24/2024",
"377128016,109 STEVENSON COLLEGE,0914,8/24/2024",
"377128017,109 STEVENSON COLLEGE,0917,8/24/2024",
"377128018,107 COWELL - STEVENSON,0932,8/24/2024",
"377128023,168 AGROECOLOGY,1059,8/24/2024",
"377128024,168 AGROECOLOGY,1106,8/24/2024",
"377128025,141 KERR HALL,1154,8/24/2024",
"377128027,140 FOUNDRY,1207,8/24/2024",
"377128028,140 FOUNDRY,1259,8/24/2024",
"377128029,140 FOUNDRY,1302,8/24/2024",
"377128030,140 FOUNDRY,1319,8/24/2024",
"377128032,112 CORE WEST STRUCTURE,1539,8/24/2024",
"377128033,112 CORE WEST STRUCTURE,1544,8/24/2024",
"377128034,112 CORE WEST STRUCTURE,1550,8/24/2024",
"377128036,112 CORE WEST STRUCTURE,1559,8/24/2024",
"377128038,112 CORE WEST STRUCTURE,1621,8/24/2024",
"377128039,150B NORTH PERIMETER,0834,8/25/2024",
"377128043,127 WEST REMOTE,0913,8/25/2024",
"377128046,162 OAKES COLLEGE,0930,8/25/2024",
"377128047,162 OAKES COLLEGE,0937,8/25/2024",
"377128048,120A LOWER MCHENRY LIBRARY,1013,8/25/2024",
"377128049,120A LOWER MCHENRY LIBRARY,1015,8/25/2024",
"377128050,112 CORE WEST STRUCTURE,1034,8/25/2024",
"377128056,168 AGROECOLOGY,1222,8/25/2024",
"377128058,112 CORE WEST STRUCTURE,1250,8/25/2024",
"377128062,112 CORE WEST STRUCTURE,1315,8/25/2024",
"377128063,WEST FIELD HOUSE - RACHEL CARSON COL,1350,8/25/2024",
"377128067,119 MERRILL COLLEGE,1532,8/25/2024",
"377128068,119 MERRILL COLLEGE,1537,8/25/2024",
"377128070,121 BIOMED - SCIENCE LIBRARY,1603,8/25/2024",
"377128071,121 BIOMED - SCIENCE LIBRARY,1605,8/25/2024",
"377128072,CROWN SERVICE ROAD,0826,8/26/2024",
"377128073,152 CROWN - MERRILL APARTMENTS,0834,8/26/2024",
"377128074,152 CROWN - MERRILL APARTMENTS,0836,8/26/2024",
"377128075,152 CROWN - MERRILL APARTMENTS,0842,8/26/2024",
"377128077,156 FIRE HOUSE,913,8/26/2024",
"377128078,110 STEVENSON COLLEGE,0934,8/26/2024",
"377128079,126 PERFORMING ARTS,1044,8/26/2024",
"377128080,126 PERFORMING ARTS,1046,8/26/2024",
"377128084,124 PORTER COLLEGE,1230,8/26/2024",
"377128086,110 STEVENSON COLLEGE,1512,8/26/2024",
"377128087,107 COWELL - STEVENSON,1518,8/26/2024",
"377128090,103A EAST FIELD HOUSE,1559,8/26/2024",
"377128091,103A EAST FIELD HOUSE,1603,8/26/2024",
"377128094,103A EAST FIELD HOUSE,1613,8/26/2024",
"377128097,FARM ROAD,1630,8/26/2024",
"377128098,109 STEVENSON COLLEGE,0851,8/30/2024",
"377128101,119 MERRILL COLLEGE,0946,8/30/2024",
"377128103,119 MERRILL COLLEGE,1012,8/30/2024",
"377128104,111A CROWN COLLEGE PIT,1045,8/30/2024",
"377128105,111A CROWN COLLEGE PIT,1102,8/30/2024",
"377128109,152 CROWN - MERRILL APARTMENTS,1155,8/30/2024",
"377128110,152 CROWN - MERRILL APARTMENTS,1157,8/30/2024",
"377128111,152 CROWN - MERRILL APARTMENTS,1200,8/30/2024",
"377128112,152 CROWN - MERRILL APARTMENTS,1203,8/30/2024",
"377128113,152 CROWN - MERRILL APARTMENTS,1207,8/30/2024",
"377128117,121 BIOMED - SCIENCE LIBRARY,1259,8/30/2024",
"377128118,121 BIOMED - SCIENCE LIBRARY,1307,8/30/2024",
"377128119,154 CROWN - MERRILL APARTMENTS,1315,8/30/2024",
"377128120,128 HEALTH CENTER,1542,8/30/2024",
"377128122,116 CAMPUS FACILITIES,0805,8/31/2024",
"377128123,116 CAMPUS FACILITIES,0814,8/31/2024",
"377128124,127 WEST REMOTE,0919,8/31/2024",
"377128126,125 PORTER COLLEGE,1055,8/31/2024",
"377128127,147 KRESGE COLLEGE,1104,8/31/2024",
"377128128,146 RACHEL CARSON COLLEGE,1112,8/31/2024",
"377128129,112 CORE WEST STRUCTURE,1134,8/31/2024",
"377128130,112 CORE WEST STRUCTURE,1144,8/31/2024",
"377128132,112 CORE WEST STRUCTURE,1157,8/31/2024",
"377128133,146 RACHEL CARSON COLLEGE,1235,8/31/2024",
"377128134,139A ENGINEERING II,1307,8/31/2024",
"377128135,139A ENGINEERING II,1311,8/31/2024",
"377128141,164 JOHN R. LEWIS COLLEGE,1557,8/31/2024",
"377128142,164 JOHN R. LEWIS COLLEGE,1605,8/31/2024",
"377128143,CROWN COLLEGE,0828,9/1/2024",
"377128144,CROWN COLLEGE,0830,9/1/2024",
"377128146,152 CROWN - MERRILL APARTMENTS,0849,9/1/2024",
"377128147,152 CROWN - MERRILL APARTMENTS,0851,9/1/2024",
"377128149,152 CROWN - MERRILL APARTMENTS,0913,9/1/2024",
"377128151,152 CROWN - MERRILL APARTMENTS,0924,9/1/2024",
"377128152,152 CROWN - MERRILL APARTMENTS,0930,9/1/2024",
"377128155,121 BIOMED - SCIENCE LIBRARY,1058,9/1/2024",
"377128157,ACADEMIC RESOURCE CENTER,1204,9/1/2024",
"377128159,ACADEMIC RESOURCE CENTER,1208,9/1/2024",
"377128162,139A ENGINEERING II,1309,9/1/2024",
"377128164,139A ENGINEERING II,1313,9/1/2024",
"377128165,139A ENGINEERING II,1316,9/1/2024",
"377128166,139B COMMUNICATIONS,1329,9/1/2024",
"377128168,126 PERFORMING ARTS,1356,9/1/2024",
"377128169,126 PERFORMING ARTS,1359,9/1/2024",
"377128170,146 RACHEL CARSON COLLEGE,1418,9/1/2024",
"377128172,127 WEST REMOTE,0837,9/7/2024",
"377128174,127 WEST REMOTE,0848,9/7/2024",
"377128175,127 WEST REMOTE,0854,9/7/2024",
"377128179,161 OAKES COLLEGE,0933,9/7/2024",
"377128180,162 OAKES COLLEGE,0940,9/7/2024",
"377128181,162 OAKES COLLEGE,0949,9/7/2024",
"377128182,162 OAKES COLLEGE,0959,9/7/2024",
"377128184,COOLIDGE DRIVE,1057,9/7/2024",
"377128185,VILLAGE ROAD,1108,9/7/2024",
"377128186,168 AGROECOLOGY,1122,9/7/2024",
"377128189,124 PORTER COLLEGE,1243,9/7/2024",
"377128192,140 FOUNDRY,1603,9/7/2024",
"377128193,120A LOWER MCHENRY LIBRARY,1619,9/7/2024",
"377128194,120A LOWER MCHENRY LIBRARY,1624,9/7/2024",
"377128198,111A CROWN COLLEGE PIT,0924,9/8/2024",
"377128201,150A NORIMETER,1213,9/8/2024",
"377128203,146 RACHEL CARSON COLLEGE,1314,9/8/2024",
"377128204,STEINHART WAY,1334,9/8/2024",
"377128205,147 KRESGE COLLEGE,1508,9/8/2024",
"377128206,124 PORTER COLLEGE,1517,9/8/2024",
"377128208,125 PORTER COLLEGE,1536,9/8/2024",
"377128209,125 PORTER COLLEGE,1549,9/8/2024",
"377128210,ACADEMIC RESOURCE CENTER,1606,9/8/2024",
"377128211,120A LOWER MCHENRY LIBRARY,1616,9/8/2024",
"377128212,120A LOWER MCHENRY LIBRARY,1618,9/8/2024",
"377128213,OAKES FIELD SERVICE ROAD,0825,9/9/2024",
"377128214,152 CROWN - MERRILL APARTMENTS,0848,9/9/2024",
"377128215,152 CROWN - MERRILL APARTMENTS,0851,9/9/2024",
"377128216,152 CROWN - MERRILL APARTMENTS,0855,9/9/2024",
"377128217,154 CROWN - MERRILL APARTMENTS,0905,9/9/2024",
"377128219,154 CROWN - MERRILL APARTMENTS,0910,9/9/2024",
"377128220,125 PORTER COLLEGE,0955,9/9/2024",
"377128222,124 PORTER COLLEGE,1006,9/9/2024",
"377128224,125 PORTER COLLEGE,1222,9/9/2024",
"377128225,107 COWELL - STEVENSON,1237,9/9/2024",
"377128226,107 COWELL - STEVENSON,1239,9/9/2024",
"377128227,107 COWELL - STEVENSON,1242,9/9/2024",
"377128228,107 COWELL - STEVENSON,1244,9/9/2024",
"377128231,107 COWELL - STEVENSON,1255,9/9/2024",
"377128235,163 COWELL PROVOST,1527,9/9/2024",
"377128236,103A EAST FIELD HOUSE,1532,9/9/2024",
"377128237,103A EAST FIELD HOUSE,1536,9/9/2024",
"377128238,103A EAST FIELD HOUSE,1538,9/9/2024",
"377128240,167 COLLEGE NINE,1558,9/9/2024",
"377128241,COLLEGE NINE,1603,9/9/2024",
"388123510,165 COLLEGE TEN,1611,2/7/2024",
"388123533,110 STEVENSON COLLEGE,11:25 AM,2/9/2024",
"388123602,128 HEALTH CENTER,1148,2/14/2024",
"388123616,158 REDWOOD GROVE APARTMENTS,1542,2/14/2024",
"388123623,124 PORTER COLLEGE,1656,2/14/2024",
"388123636,163 COWELL PROVOST,10:49 AM,2/15/2024",
"388123781,112 CORE WEST STRUCTURE,1549,2/21/2024",
"388123838,101 HAHN STUDENT SERVICES,11:51 AM,2/22/2024",
"388123846,119 MERRILL COLLEGE,1238,2/22/2024",
"388123867,112 CORE WEST STRUCTURE,1704,2/22/2024",
"388123895,139A ENGINEERING II,1224,2/23/2024",
"388123957,103A EAST FIELD HOUSE,1534,2/27/2024",
"388124038,127 WEST REMOTE,1118,3/2/2024",
"388124231,119 MERRILL COLLEGE,1252,3/8/2024",
"388124248,107 COWELL - STEVENSON,1521,3/8/2024",
"388124483,158 REDWOOD GROVE APARTMENTS,1300,3/22/2024",
"388124616,143 KRESGE COLLEGE,0829,3/30/2024",
"388124670,156 FIRE HOUSE,0941,4/1/2024",
"388124716,124 PORTER COLLEGE,1027,4/6/2024",
"388124733,112 CORE WEST STRUCTURE,1234,4/6/2024",
"388124747,112 CORE WEST STRUCTURE,1325,4/6/2024",
"388124770,PORTER COLLEGE,1008,4/7/2024",
"388124803,112 CORE WEST STRUCTURE,1318,4/7/2024",
"388124838,203 C.S.C. - CENTER FOR OCEAN HEALTH,0859,4/12/2024",
"388124863,112 CORE WEST STRUCTURE,1131,4/12/2024",
"388125079,124 PORTER COLLEGE,1410,4/15/2024",
"388125133,126 PERFORMING ARTS,1643,4/19/2024",
"388125242,111A CROWN COLLEGE PIT,1052,4/21/2024",
"388125600,109 STEVENSON COLLEGE,0833,4/29/2024",
"388125730,104 EAST REMOTE,1504,5/3/2024",
"388125750,127 WEST REMOTE,0846,5/4/2024",
"388125767,150B NORTH PERIMETER,1051,5/4/2024",
"388125792,112 CORE WEST STRUCTURE,1235,5/4/2024",
"388125818,112 CORE WEST STRUCTURE,1022,5/5/2024",
"388125846,108 STEVENSON SERVICE ROAD,1453,5/5/2024",
"388125850,119 MERRILL COLLEGE,1521,5/5/2024",
"388125856,121 BIOMED - SCIENCE LIBRARY,1622,5/5/2024",
"388125879,109 STEVENSON COLLEGE,0905,5/6/2024",
"388125895,152 CROWN - MERRILL APARTMENTS,1027,5/6/2024",
"388126033,112 CORE WEST STRUCTURE,1438,5/11/2024",
"388126059,165 JOHN R. LEWIS COLLEGE,0951,5/12/2024",
"388126102,112 CORE WEST STRUCTURE,1609,5/12/2024",
"388126132,109 STEVENSON COLLEGE,0956,5/13/2024",
"388126202,163 COWELL PROVOST,12:07 PM,5/17/2024",
"388126226,104 EAST REMOTE,1427,5/17/2024",
"388126266,104 EAST REMOTE,1202,5/18/2024",
"388126275,104 EAST REMOTE,1242,5/18/2024",
"388126340,112 CORE WEST STRUCTURE,1347,5/19/2024",
"388126509,104 EAST REMOTE,1507,5/25/2024",
"388126600,143 KRESGE COLLEGE,0907,6/14/2024",
"388126602,143 KRESGE COLLEGE,0910,6/14/2024",
"388126613,147 KRESGE COLLEGE,0955,6/14/2024",
"388126726,COOLIDGE DRIVE,1512,6/16/2024",
"388126730,103A EAST FIELD HOUSE,0918,6/17/2024",
"388126794,128 HEALTH CENTER,1110,6/22/2024",
"388126828,103A EAST FIELD HOUSE,1237,6/23/2024",
"24pk200039,15169,0539,6/5/2024",
"399131975,EARTH AND MARINE SCIENCES BUILDING,0147,2/6/2024",
"411125607,139A ENGINEERING II,0137,2/13/2024",
"388126829,103A EAST FIELD HOUSE,1240,6/23/2024",
"388126831,112 CORE WEST STRUCTURE,1437,6/23/2024",
"388126837,126 PERFORMING ARTS,0950,6/24/2024",
"388127073,126 PERFORMING ARTS,1130,7/13/2024",
"388127106,101 HAHN STUDENT SERVICES,0917,7/14/2024",
"388127123,104 EAST REMOTE,1236,7/14/2024",
"388127139,154 CROWN - MERRILL APARTMENTS,0840,7/15/2024",
"388127147,124 PORTER COLLEGE,1047,7/15/2024",
"388127179,139A ENGINEERING II,1003,7/17/2024",
"388127190,104 EAST REMOTE,1149,7/17/2024",
"388127220,156 FIRE HOUSE,0801,7/18/2024",
"388127249,112 CORE WEST STRUCTURE,2:23 PM,7/18/2024",
"388127376,109 STEVENSON COLLEGE,0818,7/26/2024",
"388127432,111A CROWN COLLEGE PIT,0855,7/27/2024",
"388127496,112 CORE WEST STRUCTURE,1110,7/31/2024",
"388127532,149 HELLER EXTENSION,1609,7/31/2024",
"388127545,103A EAST FIELD HOUSE,0805,8/22/2024",
"388127546,103A EAST FIELD HOUSE,0808,8/22/2024",
"388127547,103A EAST FIELD HOUSE,0813,8/22/2024",
"388127550,168 AGROECOLOGY,1433,8/30/2024",
"388127551,141 KERR HALL,1455,8/30/2024",
"388127553,150A NORTH PERIMETER,0828,8/31/2024",
"388127554,150A NORTH PERIMETER,0832,8/31/2024",
"388127556,119 MERRILL COLLEGE,0914,8/31/2024",
"388127557,119 MERRILL COLLEGE,0918,8/31/2024",
"388127561,111B CROWN COLLEGE CIRCLE,1008,8/31/2024",
"388127562,111B CROWN COLLEGE CIRCLE,1013,8/31/2024",
"388127564,111B CROWN COLLEGE CIRCLE,1036,8/31/2024",
"388127565,111A CROWN COLLEGE PIT,1051,8/31/2024",
"388127566,111A CROWN COLLEGE PIT,1101,8/31/2024",
"388127567,111A CROWN COLLEGE PIT,1112,8/31/2024",
"388127569,152 CROWN - MERRILL APARTMENTS,1130,8/31/2024",
"388127570,152 CROWN - MERRILL APARTMENTS,1134,8/31/2024",
"388127571,MERRILL COLLEGE,1151,8/31/2024",
"388127573,104 EAST REMOTE,1426,8/31/2024",
"388127574,104 EAST REMOTE,1432,8/31/2024",
"388127576,104 EAST REMOTE,1440,8/31/2024",
"388127578,104 EAST REMOTE,1455,8/31/2024",
"388127579,104 EAST REMOTE,1458,8/31/2024",
"388127584,103A EAST FIELD HOUSE,1538,8/31/2024",
"388127585,103A EAST FIELD HOUSE,1542,8/31/2024",
"388127586,103A EAST FIELD HOUSE,1550,8/31/2024",
"388127589,119 MERRILL COLLEGE,0758,9/5/2024",
"388127590,119 MERRILL COLLEGE,0801,9/5/2024",
"388127592,119 MERRILL COLLEGE,0810,9/5/2024",
"388127594,119 MERRILL COLLEGE,0815,9/5/2024",
"388127598,167 COLLEGE NINE,0846,9/5/2024",
"388127599,167 COLLEGE NINE,0850,9/5/2024",
"388127600,167 COLLEGE NINE,0855,9/5/2024",
"388127602,110 STEVENSON COLLEGE,1106,9/5/2024",
"388127603,109 STEVENSON COLLEGE,1112,9/5/2024",
"388127604,109 STEVENSON COLLEGE,1116,9/5/2024",
"388127606,109 STEVENSON COLLEGE,1123,9/5/2024",
"388127608,109 STEVENSON COLLEGE,1130,9/5/2024",
"388127609,109 STEVENSON COLLEGE,1132,9/5/2024",
"388127610,109 STEVENSON COLLEGE,1138,9/5/2024",
"388127613,104 EAST REMOTE,1423,9/5/2024",
"388127614,104 EAST REMOTE,1430,9/5/2024",
"388127615,104 EAST REMOTE,1433,9/5/2024",
"388127616,104 EAST REMOTE,1436,9/5/2024",
"388127617,104 EAST REMOTE,1441,9/5/2024",
"388127618,104 EAST REMOTE,1447,9/5/2024",
"388127622,104 EAST REMOTE,1509,9/5/2024",
"388127623,104 EAST REMOTE,1521,9/5/2024",
"388127624,104 EAST REMOTE,1526,9/5/2024",
"388127626,103A EAST FIELD HOUSE,1541,9/5/2024",
"388127627,103A EAST FIELD HOUSE,1549,9/5/2024",
"388127628,103A EAST FIELD HOUSE,1553,9/5/2024",
"388127630,101 HAHN STUDENT SERVICES,1613,9/5/2024",
"388127631,101 HAHN STUDENT SERVICES,1616,9/5/2024",
"388127633,101 HAHN STUDENT SERVICES,1627,9/5/2024",
"388127635,101 HAHN STUDENT SERVICES,1634,9/5/2024",
"388127636,127 WEST REMOTE,0755,9/6/2024",
"388127637,127 WEST REMOTE,0802,9/6/2024",
"388127641,135 FAMILY STUDENT HOUSING - 700 LOO,0851,9/6/2024",
"388127642,131 FAMILY STUDENT HOUSING - 300 LOO,0926,9/6/2024",
"388127643,131 FAMILY STUDENT HOUSING - 300 LOO,0929,9/6/2024",
"388127645,131 FAMILY STUDENT HOUSING - 300 LOO,0936,9/6/2024",
"388127646,131 FAMILY STUDENT HOUSING - 300 LOO,0938,9/6/2024",
"388127649,134 FAMILY STUDENT HOUSING - 600 LOO,0950,9/6/2024",
"388127651,146 RACHEL CARSON COLLEGE,1016,9/6/2024",
"388127653,146 RACHEL CARSON COLLEGE,1021,9/6/2024",
"388127655,146 RACHEL CARSON COLLEGE,1030,9/6/2024",
"388127656,125 PORTER COLLEGE,1049,9/6/2024",
"388127658,125 PORTER COLLEGE,1106,9/6/2024",
"388127659,PORTER COLLEGE,1116,9/6/2024",
"388127661,PORTER COLLEGE,1122,9/6/2024",
"388127662,124 PORTER COLLEGE,1200,9/6/2024",
"388127664,124 PORTER COLLEGE,1207,9/6/2024",
"388127666,126 PERFORMING ARTS,1234,9/6/2024",
"388127667,126 PERFORMING ARTS,1240,9/6/2024",
"388127668,112 CORE WEST STRUCTURE,1505,9/6/2024",
"388127670,112 CORE WEST STRUCTURE,1517,9/6/2024",
"388127672,112 CORE WEST STRUCTURE,1527,9/6/2024",
"388127674,112 CORE WEST STRUCTURE,1535,9/6/2024",
"388127675,112 CORE WEST STRUCTURE,1540,9/6/2024",
"388127676,139A ENGINEERING II,1619,9/6/2024",
"388127677,139A ENGINEERING II,1623,9/6/2024",
"388127678,139A ENGINEERING II,1626,9/6/2024",
"388127679,139A ENGINEERING II,1630,9/6/2024",
"388127680,MERRILL COLLEGE,0806,9/7/2024",
"388127681,152 CROWN - MERRILL APARTMENTS,0813,9/7/2024",
"388127682,152 CROWN - MERRILL APARTMENTS,0816,9/7/2024",
"388127683,152 CROWN - MERRILL APARTMENTS,0818,9/7/2024",
"388127684,152 CROWN - MERRILL APARTMENTS,0822,9/7/2024",
"388127685,152 CROWN - MERRILL APARTMENTS,0826,9/7/2024",
"388127687,154 CROWN - MERRILL APARTMENTS,0838,9/7/2024",
"388127688,154 CROWN - MERRILL APARTMENTS,0845,9/7/2024",
"388127690,154 CROWN - MERRILL APARTMENTS,0851,9/7/2024",
"388127692,167 COLLEGE NINE,0932,9/7/2024",
"388127693,167 COLLEGE NINE,1003,9/7/2024",
"388127694,107 COWELL - STEVENSON,1037,9/7/2024",
"388127695,107 COWELL - STEVENSON,1040,9/7/2024",
"388127698,108 STEVENSON SERVICE ROAD,1116,9/7/2024",
"388127699,108 STEVENSON SERVICE ROAD,1120,9/7/2024",
"388127700,108 STEVENSON SERVICE ROAD,1124,9/7/2024",
"388127701,107 COWELL - STEVENSON,1133,9/7/2024",
"388127702,107 COWELL - STEVENSON,1135,9/7/2024",
"388127704,164 JOHN R. LEWIS COLLEGE,1431,9/7/2024",
"388127705,128 HEALTH CENTER,1522,9/7/2024",
"388127706,104 EAST REMOTE,1537,9/7/2024",
"388127707,167 COLLEGE NINE,0821,9/11/2024",
"388127708,167 COLLEGE NINE,0825,9/11/2024",
"388127709,164 JOHN R. LEWIS COLLEGE,0837,9/11/2024",
"388127711,139A ENGINEERING II,0904,9/11/2024",
"388127712,139A ENGINEERING II,0907,9/11/2024",
"388127713,139A ENGINEERING II,0910,9/11/2024",
"388127714,157 GRADUATE STUDENT APARTMENTS,0942,9/11/2024",
"388127715,157 GRADUATE STUDENT APARTMENTS,0947,9/11/2024",
"388127716,128 HEALTH CENTER,1016,9/11/2024",
"388127717,128 HEALTH CENTER,1018,9/11/2024",
"388127718,107 COWELL - STEVENSON,1037,9/11/2024",
"388127719,107 COWELL - STEVENSON,1040,9/11/2024",
"388127720,107 COWELL - STEVENSON,1043,9/11/2024",
"388127721,108 STEVENSON SERVICE ROAD,1050,9/11/2024",
"388127722,109 STEVENSON COLLEGE,1109,9/11/2024",
"388127723,109 STEVENSON COLLEGE,1112,9/11/2024",
"399123875,134 FAMILY STUDENT HOUSING - 600 LOO,1108,1/6/2024",
"399123906,165 COLLEGE TEN,1100,1/10/2024",
"399123990,112 CORE WEST STRUCTURE,1217,1/12/2024",
"399124178,150A NORIMITER,1246,1/19/2024",
"399124180,157 GRADUATE STUDENT APARTMENTS,1302,1/19/2024",
"399124212,158 REDWOOD GROVE APARTMENTS,1719,1/19/2024",
"399124349,112 CORE WEST STRUCTURE,1255,1/25/2024",
"399124472,165 COLLEGE TEN,1733,1/31/2024",
"399124549,160 OAKES COLLEGE,1230,2/3/2024",
"399124598,ACADEMIC RESOURCE CENTER,1745,2/7/2024",
"399124622,109 STEVENSON COLLEGE,1152,2/9/2024",
"399124642,124 PORTER COLLEGE,1615,2/9/2024",
"399124692,103A EAST FIELD HOUSE,1747,2/10/2024",
"399124749,103A EAST FIELD HOUSE,1020,2/15/2024",
"399124823,113 THIMANN LAB,1408,2/16/2024",
"399124850,111A CROWN COLLEGE PIT,1654,2/16/2024",
"399124890,126 PERFORMING ARTS,1247,2/17/2024",
"399124899,VILLAGE,1513,2/17/2024",
"399124912,135 FAMILY STUDENT HOUSING - 700 LOO,0903,2/21/2024",
"399125013,119 MERRILL COLLEGE,1256,2/22/2024",
"399125039,112 CORE WEST STRUCTURE,1723,2/22/2024",
"399125048,114 SOCIAL SCIENCES,1008,2/23/2024",
"399125163,112 CORE WEST STRUCTURE,1202,2/28/2024",
"399125206,103A EAST FIELD HOUSE,1121,3/1/2024",
"399125330,103A EAST FIELD HOUSE,1439,3/6/2024",
"399125458,103A EAST FIELD HOUSE,1509,3/15/2024",
"399125500,124 PORTER COLLEGE,1124,3/16/2024",
"399125511,126 PERFORMING ARTS,1240,3/16/2024",
"399125748,112 CORE WEST STRUCTURE,1135,3/22/2024",
"399125828,125 PORTER COLLEGE,1238,3/27/2024",
"399125836,OAKES COLLEGE,1330,3/27/2024",
"399125907,103A EAST FIELD HOUSE,1437,3/30/2024",
"399125925,169 THE VILLAGE,0957,4/3/2024",
"399126096,162 OAKES COLLEGE,1250,4/5/2024",
"399126233,102 QUARRY PLAZA,1618,4/10/2024",
"399126246,103A EAST FIELD HOUSE,0846,4/11/2024",
"399126262,143 KRESGE COLLEGE,1059,4/11/2024",
"399126306,103A EAST FIELD HOUSE,0909,4/12/2024",
"399126323,112 CORE WEST STRUCTURE,1141,4/12/2024",
"399126492,124 PORTER COLLEGE,1028,4/18/2024",
"399126579,158 REDWOOD GROVE APARTMENTS,0919,4/20/2024",
"399126651,125 PORTER COLLEGE,0917,4/24/2024",
"399126692,126 PERFORMING ARTS,1207,4/24/2024",
"399126724,103A EAST FIELD HOUSE,1540,4/24/2024",
"399126770,164 JOHN R. LEWIS COLLEGE,1153,4/25/2024",
"399126863,103A EAST FIELD HOUSE,0923,5/1/2024",
"399126927,159 REDWOOD GROVE APARTMENTS,0829,5/2/2024",
"399127011,112 CORE WEST STRUCTURE,1018,5/3/2024",
"399127087,112 CORE WEST STRUCTURE,1151,5/4/2024",
"399127132,OAKES FIELD SERVICE ROAD,0917,5/8/2024",
"399127210,108 STEVENSON SERVICE ROAD,0844,5/9/2024",
"399127250,165 JOHN R. LEWIS COLLEGE,1242,5/9/2024",
"399127270,169 THE VILLAGE,0818,5/10/2024",
"399127386,109 STEVENSON COLLEGE,1459,5/11/2024",
"399127398,CROWN SERVICE ROAD,0802,5/15/2024",
"399127489,165 JOHN R. LEWIS COLLEGE,0945,5/16/2024",
"399127516,139A ENGINEERING II,1240,5/16/2024",
"399127595,164 JOHN R. LEWIS COLLEGE,0841,5/23/2024",
"399127603,165 JOHN R. LEWIS COLLEGE,0914,5/23/2024",
"399127636,124 PORTER COLLEGE,1216,5/23/2024",
"399127667,119 MERRILL COLLEGE,0857,5/24/2024",
"399127669,119 MERRILL COLLEGE,0904,5/24/2024",
"399127808,147 KRESGE COLLEGE,1045,5/30/2024",
"399127817,124 PORTER COLLEGE,1439,5/30/2024",
"399127873,124 PORTER COLLEGE,0942,5/31/2024",
"399127885,124 PORTER COLLEGE,1007,5/31/2024",
"399127907,WEST FIELD HOUSE - RACHEL CARSON COL,1435,5/31/2024",
"399128006,143 KRESGE COLLEGE,1225,6/5/2024",
"399128024,BASKIN VISUAL ARTS,1607,6/5/2024",
"399128078,139B COMMUNICATIONS,1455,6/6/2024",
"399128092,103A EAST FIELD HOUSE,0849,6/7/2024",
"399128173,160 OAKES COLLEGE,1145,6/8/2024",
"399128221,108 STEVENSON SERVICE ROAD,0937,6/12/2024",
"399128257,103A EAST FIELD HOUSE,1422,6/12/2024",
"399128267,103A EAST FIELD HOUSE,1510,6/12/2024",
"399128273,120A LOWER MCHENRY LIBRARY,1609,6/12/2024",
"399128286,103A EAST FIELD HOUSE,0841,6/13/2024",
"399128297,108 STEVENSON SERVICE ROAD,0921,6/13/2024",
"399128308,147 KRESGE COLLEGE,1021,6/13/2024",
"399128325,ACADEMIC RESOURCE CENTER,1424,6/13/2024",
"399128327,ACADEMIC RESOURCE CENTER,1427,6/13/2024",
"399128357,103A EAST FIELD HOUSE,0943,6/14/2024",
"399128397,COWELL COLLEGE INFILL APTS,0955,6/15/2024",
"399128453,FAMILY STUDENT HOUSING,1526,6/20/2024",
"399128514,156 FIRE HOUSE,1035,6/26/2024",
"399128570,166 COLLEGE NINE,1219,6/27/2024",
"399128588,125 PORTER COLLEGE,0859,6/28/2024",
"399128619,206 C.S.C. - SURGE PARKING,1436,6/28/2024",
"399128673,103A EAST FIELD HOUSE,1439,7/3/2024",
"399128705,124 PORTER COLLEGE,1552,7/6/2024",
"399128706,OAKES FIELD SERVICE ROAD,1218,7/18/2024",
"399128772,201 C.S.C. - SEYMOUR CENTER,1419,7/20/2024",
"399128773,201 C.S.C. - SEYMOUR CENTER,1423,7/20/2024",
"399128786,150B NORIMETER,1919,7/20/2024",
"399128791,103A EAST FIELD HOUSE,1219,7/21/2024",
"399128821,201 C.S.C. - SEYMOUR CENTER,1309,7/25/2024",
"399128846,149 HELLER EXTENSION,1837,7/25/2024",
"399128865,112 CORE WEST STRUCTURE,1339,7/26/2024",
"399128881,126 PERFORMING ARTS,1526,7/26/2024",
"399128886,126 PERFORMING ARTS,1543,7/26/2024",
"399128909,103A EAST FIELD HOUSE,1725,7/27/2024",
"399128972,168 AGROECOLOGY,2016,8/1/2024",
"399128986,112 CORE WEST STRUCTURE,1717,8/2/2024",
"399128994,WEST SIDE RESEARCH PARK,1210,8/3/2024",
"399129014,103A EAST FIELD HOUSE,1804,8/3/2024",
"399129027,103A EAST FIELD HOUSE,1200,8/4/2024",
"399129028,103A EAST FIELD HOUSE,1202,8/4/2024",
"399129032,103A EAST FIELD HOUSE,1215,8/4/2024",
"399129035,101 HAHN STUDENT SERVICES,1305,8/4/2024",
"399129039,101 HAHN STUDENT SERVICES,1316,8/4/2024",
"399129046,113 THIMANN LAB,1551,8/4/2024",
"399129047,103A EAST FIELD HOUSE,1731,8/4/2024",
"399129050,103A EAST FIELD HOUSE,1743,8/4/2024",
"399129051,103A EAST FIELD HOUSE,1745,8/4/2024",
"399129052,103A EAST FIELD HOUSE,1749,8/4/2024",
"399129057,152 CROWN - MERRILL APARTMENTS,1929,8/4/2024",
"399129065,103A EAST FIELD HOUSE,1248,8/8/2024",
"399129066,103A EAST FIELD HOUSE,1253,8/8/2024",
"399129067,103A EAST FIELD HOUSE,1258,8/8/2024",
"399129075,113 THIMANN LAB,1430,8/8/2024",
"399129081,112 CORE WEST STRUCTURE,1510,8/8/2024",
"399129087,112 CORE WEST STRUCTURE,1538,8/8/2024",
"399129092,112 CORE WEST STRUCTURE,1559,8/8/2024",
"399129096,120A LOWER MCHENRY LIBRARY,1930,8/8/2024",
"399129098,103A EAST FIELD HOUSE,1706,8/10/2024",
"399129100,103A EAST FIELD HOUSE,1710,8/10/2024",
"399129108,111A CROWN COLLEGE PIT,1839,8/10/2024",
"399129112,111A CROWN COLLEGE PIT,1903,8/10/2024",
"399129113,111A CROWN COLLEGE PIT,1907,8/10/2024",
"399129114,111A CROWN COLLEGE PIT,1910,8/10/2024",
"399129116,149 HELLER EXTENSION,1940,8/10/2024",
"399129118,116 CAMPUS FACILITIES,1140,8/11/2024",
"399129123,112 CORE WEST STRUCTURE,1224,8/11/2024",
"399129124,112 CORE WEST STRUCTURE,1257,8/11/2024",
"399129130,112 CORE WEST STRUCTURE,1321,8/11/2024",
"399129138,120A LOWER MCHENRY LIBRARY,1450,8/11/2024",
"399129139,ACADEMIC RESOURCE CENTER,1506,8/11/2024",
"399129147,103A EAST FIELD HOUSE,1747,8/11/2024",
"399129154,168 AGROECOLOGY,1234,8/16/2024",
"399129155,168 AGROECOLOGY,1237,8/16/2024",
"399129160,103A EAST FIELD HOUSE,1508,8/16/2024",
"399129164,119 MERRILL COLLEGE,1729,8/16/2024",
"399129165,119 MERRILL COLLEGE,1738,8/16/2024",
"399129166,CROWN SERVICE ROAD,1805,8/16/2024",
"399129167,111B CROWN COLLEGE CIRCLE,1811,8/16/2024",
"399129168,111B CROWN COLLEGE CIRCLE,1813,8/16/2024",
"399129172,111A CROWN COLLEGE PIT,1852,8/16/2024",
"399129173,111A CROWN COLLEGE PIT,1857,8/16/2024",
"399129174,111A CROWN COLLEGE PIT,1859,8/16/2024",
"399129175,111A CROWN COLLEGE PIT,1905,8/16/2024",
"399129176,111A CROWN COLLEGE PIT,1911,8/16/2024",
"399129177,111A CROWN COLLEGE PIT,1913,8/16/2024",
"399129178,111A CROWN COLLEGE PIT,1917,8/16/2024",
"399129183,112 CORE WEST STRUCTURE,1247,8/17/2024",
"399129185,112 CORE WEST STRUCTURE,1255,8/17/2024",
"399129193,112 CORE WEST STRUCTURE,1349,8/17/2024",
"399129195,112 CORE WEST STRUCTURE,1354,8/17/2024",
"399129196,112 CORE WEST STRUCTURE,1357,8/17/2024",
"399129197,112 CORE WEST STRUCTURE,1403,8/17/2024",
"399129202,ACADEMIC RESOURCE CENTER,1526,8/17/2024",
"399129203,ACADEMIC RESOURCE CENTER,1529,8/17/2024",
"399129204,ACADEMIC RESOURCE CENTER,1531,8/17/2024",
"399129205,120A LOWER MCHENRY LIBRARY,1539,8/17/2024",
"399129209,103A EAST FIELD HOUSE,1800,8/17/2024",
"399129211,103A EAST FIELD HOUSE,1807,8/17/2024",
"399129215,103A EAST FIELD HOUSE,1823,8/17/2024",
"399129218,EARTH AND MARINE SCIENCES BUILDING,1923,8/17/2024",
"399129219,EARTH AND MARINE SCIENCES BUILDING,1925,8/17/2024",
"399129220,EARTH AND MARINE SCIENCES BUILDING,1926,8/17/2024",
"399129226,112 CORE WEST STRUCTURE,1240,8/18/2024",
"399129228,103A EAST FIELD HOUSE,1350,8/18/2024",
"399129229,103A EAST FIELD HOUSE,1356,8/18/2024",
"399129233,103A EAST FIELD HOUSE,1414,8/18/2024",
"399129234,103A EAST FIELD HOUSE,1416,8/18/2024",
"399129236,155 CROWN - MERRILL APARTMENTS,1509,8/18/2024",
"399129237,152 CROWN - MERRILL APARTMENTS,1525,8/18/2024",
"399129238,152 CROWN - MERRILL APARTMENTS,1527,8/18/2024",
"399129239,152 CROWN - MERRILL APARTMENTS,1529,8/18/2024",
"399129241,156 FIRE HOUSE,1545,8/18/2024",
"399129247,111A CROWN COLLEGE PIT,1832,8/18/2024",
"399129251,111A CROWN COLLEGE PIT,1843,8/18/2024",
"399129252,111A CROWN COLLEGE PIT,1845,8/18/2024",
"399129253,111A CROWN COLLEGE PIT,1847,8/18/2024",
"399129255,156 FIRE HOUSE,1859,8/18/2024",
"399129261,109 STEVENSON COLLEGE,1247,8/22/2024",
"399129263,COWELL COLLEGE,1327,8/22/2024",
"399129267,107 COWELL - STEVENSON,1353,8/22/2024",
"399129269,102 QUARRY PLAZA,1431,8/22/2024",
"399129270,120A LOWER MCHENRY LIBRARY,1507,8/22/2024",
"399129273,ACADEMIC RESOURCE CENTER,1520,8/22/2024",
"399129274,126 PERFORMING ARTS,1545,8/22/2024",
"399129275,126 PERFORMING ARTS,1546,8/22/2024",
"399129279,103A EAST FIELD HOUSE,1740,8/22/2024",
"399129281,103A EAST FIELD HOUSE,1745,8/22/2024",
"399129282,103A EAST FIELD HOUSE,1747,8/22/2024",
"399129284,103A EAST FIELD HOUSE,1753,8/22/2024",
"399129286,103A EAST FIELD HOUSE,1758,8/22/2024",
"399129287,103A EAST FIELD HOUSE,1801,8/22/2024",
"399129291,139B COMMUNICATIONS,1300,8/23/2024",
"399129296,149 HELLER EXTENSION,1324,8/23/2024",
"399129297,112 CORE WEST STRUCTURE,1404,8/23/2024",
"399129298,112 CORE WEST STRUCTURE,1410,8/23/2024",
"399129302,113 THIMANN LAB,1424,8/23/2024",
"399129303,112 CORE WEST STRUCTURE,1441,8/23/2024",
"399129306,112 CORE WEST STRUCTURE,1459,8/23/2024",
"399129308,103A EAST FIELD HOUSE,1853,8/23/2024",
"399129312,103A EAST FIELD HOUSE,1914,8/23/2024",
"399129313,103A EAST FIELD HOUSE,1918,8/23/2024",
"399129315,113 THIMANN LAB,1405,8/24/2024",
"399129316,113 THIMANN LAB,1407,8/24/2024",
"399129317,113 THIMANN LAB,1409,8/24/2024",
"399129318,158 REDWOOD GROVE APARTMENTS,1425,8/24/2024",
"399129320,103A EAST FIELD HOUSE,1535,8/24/2024",
"399129321,103A EAST FIELD HOUSE,1537,8/24/2024",
"399129322,103A EAST FIELD HOUSE,1539,8/24/2024",
"399129323,119 MERRILL COLLEGE,1750,8/24/2024",
"399129325,119 MERRILL COLLEGE,1802,8/24/2024",
"399129328,111B CROWN COLLEGE CIRCLE,1831,8/24/2024",
"399129333,127 WEST REMOTE,1229,9/5/2024",
"399129335,127 WEST REMOTE,1234,9/5/2024",
"399129336,127 WEST REMOTE,1238,9/5/2024",
"399129337,127 WEST REMOTE,1243,9/5/2024",
"399129338,RED HILL ROAD,1303,9/5/2024",
"399129340,135 FAMILY STUDENT HOUSING - 700 LOO,1342,9/5/2024",
"399129341,135 FAMILY STUDENT HOUSING - 700 LOO,1344,9/5/2024",
"399129342,FAMILY STUDENT HOUSING,1347,9/5/2024",
"399129343,FAMILY STUDENT HOUSING,1359,9/5/2024",
"399129345,146 RACHEL CARSON COLLEGE,1437,9/5/2024",
"399129346,ACADEMIC RESOURCE CENTER,1457,9/5/2024",
"399129347,120A LOWER MCHENRY LIBRARY,1506,9/5/2024",
"399129348,120A LOWER MCHENRY LIBRARY,1508,9/5/2024",
"399129351,120B UPPER MCHENRY LIBRARY - RESTRIC,1520,9/5/2024",
"399129356,103A EAST FIELD HOUSE,1829,9/5/2024",
"399129357,103A EAST FIELD HOUSE,1833,9/5/2024",
"399129358,103A EAST FIELD HOUSE,1836,9/5/2024",
"399129359,103A EAST FIELD HOUSE,1839,9/5/2024",
"399129360,103A EAST FIELD HOUSE,1842,9/5/2024",
"399129361,103A EAST FIELD HOUSE,1843,9/5/2024",
"399129362,103A EAST FIELD HOUSE,1845,9/5/2024",
"399129363,103A EAST FIELD HOUSE,1854,9/5/2024",
"399129364,104 EAST REMOTE,1218,9/6/2024",
"399129365,104 EAST REMOTE,1223,9/6/2024",
"399129367,103A EAST FIELD HOUSE,1254,9/6/2024",
"399129368,103A EAST FIELD HOUSE,1257,9/6/2024",
"399129369,103A EAST FIELD HOUSE,1300,9/6/2024",
"399129373,101 HAHN STUDENT SERVICES,1349,9/6/2024",
"399129374,EARTH AND MARINE SCIENCES BUILDING,1431,9/6/2024",
"399129375,EARTH AND MARINE SCIENCES BUILDING,1434,9/6/2024",
"399129378,112 CORE WEST STRUCTURE,1518,9/6/2024",
"399129379,112 CORE WEST STRUCTURE,1526,9/6/2024",
"399129380,112 CORE WEST STRUCTURE,1532,9/6/2024",
"399129381,112 CORE WEST STRUCTURE,1534,9/6/2024",
"399129383,113 THIMANN LAB,1551,9/6/2024",
"399129385,KRESGE COLLEGE,1940,9/6/2024",
"399129388,301 2300 DELAWARE - SOUTH LOT,1216,9/7/2024",
"399129390,202 C.S.C. - SOUTH SERVICE AREA,1233,9/7/2024",
"399129391,205 C.S.C. - COASTAL BIOLOGY BLDG,1241,9/7/2024",
"399129392,205 C.S.C. - COASTAL BIOLOGY BLDG,1244,9/7/2024",
"399129396,LOOKOUT,1435,9/7/2024",
"399129400,166 COLLEGE NINE,1805,9/7/2024",
"399129403,164 JOHN R. LEWIS COLLEGE,1822,9/7/2024",
"399129404,103A EAST FIELD HOUSE,1217,9/8/2024",
"399129406,103A EAST FIELD HOUSE,1225,9/8/2024",
"399129407,168 AGROECOLOGY,1259,9/8/2024",
"399129408,FARM ROAD,1304,9/8/2024",
"399129409,163 COWELL PROVOST,1313,9/8/2024",
"399129410,163 COWELL PROVOST,1315,9/8/2024",
"399129411,102 QUARRY PLAZA,1323,9/8/2024",
"399129412,113 THIMANN LAB,1407,9/8/2024",
"399129413,112 CORE WEST STRUCTURE,1416,9/8/2024",
"399129415,112 CORE WEST STRUCTURE,1439,9/8/2024",
"399129416,112 CORE WEST STRUCTURE,1449,9/8/2024",
"399129418,112 CORE WEST STRUCTURE,1519,9/8/2024",
"399129419,112 CORE WEST STRUCTURE,1523,9/8/2024",
"399129421,152 CROWN - MERRILL APARTMENTS,1901,9/8/2024",
"399129422,152 CROWN - MERRILL APARTMENTS,1904,9/8/2024",
"399129423,152 CROWN - MERRILL APARTMENTS,1914,9/8/2024",
"399129424,159 REDWOOD GROVE APARTMENTS,1939,9/8/2024",
"399129425,158 REDWOOD GROVE APARTMENTS,1945,9/8/2024",
"399129426,158 REDWOOD GROVE APARTMENTS,1947,9/8/2024",
"400123496,162 OAKES COLLEGE,0940,11/29/2023",
"400123569,165 COLLEGE TEN,1530,11/30/2023",
"400123719,COWELL COLLEGE INFILL APTS,0824,12/6/2023",
"400123738,124 PORTER COLLEGE,0928,12/6/2023",
"400123764,125 PORTER COLLEGE,1003,12/6/2023",
"400123814,128 HEALTH CENTER,1555,12/6/2023",
"400123944,FAMILY STUDENT HOUSING,1617,1/3/2024",
"400123956,134 FAMILY STUDENT HOUSING - 600 LOO,1446,1/5/2024",
"400123982,158 REDWOOD GROVE APARTMENTS,0857,1/17/2024",
"400124021,126 PERFORMING ARTS,1211,1/17/2024",
"400124055,167 COLLEGE NINE,1555,1/17/2024",
"400124114,125 PORTER COLLEGE,0941,1/18/2024",
"400124304,158 REDWOOD GROVE APARTMENTS,0805,1/23/2024",
"400124355,ACADEMIC RESOURCE CENTER,1332,1/23/2024",
"400124426,119 MERRILL COLLEGE,1023,1/24/2024",
"400124538,162 OAKES COLLEGE,0923,1/25/2024",
"400124624,165 COLLEGE TEN,0814,1/26/2024",
"400124648,119 MERRILL COLLEGE,0940,1/26/2024",
"400124834,124 PORTER COLLEGE,1156,1/31/2024",
"400124897,111A CROWN COLLEGE PIT,1606,1/31/2024",
"400124906,111A CROWN COLLEGE PIT,1617,1/31/2024",
"400124928,167 COLLEGE NINE,0959,2/1/2024",
"400125069,158 REDWOOD GROVE APARTMENTS,0816,2/6/2024",
"400125109,119 MERRILL COLLEGE,1218,2/6/2024",
"400125203,102 QUARRY PLAZA,1607,2/7/2024",
"400125247,STEVENSON SERVICE ROAD,1332,2/8/2024",
"400125284,108 STEVENSON SERVICE ROAD,0929,2/13/2024",
"400125320,108 STEVENSON SERVICE ROAD,1203,2/14/2024",
"400125417,104 EAST REMOTE,1157,7/7/2024",
"400125422,104 EAST REMOTE,1235,7/7/2024",
"400125438,166 COLLEGE NINE,1245,7/11/2024",
"400125446,112 CORE WEST STRUCTURE,1400,7/11/2024",
"400125488,128 HEALTH CENTER,1526,7/12/2024",
"400125566,125 PORTER COLLEGE,2007,7/14/2024",
"400125572,150A NORIMETER,1411,7/18/2024",
"400125607,111A CROWN COLLEGE PIT,1810,7/19/2024",
"400125675,101 HAHN STUDENT SERVICES,1347,7/21/2024",
"400125677,101 HAHN STUDENT SERVICES,1353,7/21/2024",
"400125680,101 HAHN STUDENT SERVICES,1404,7/21/2024",
"400125699,201 C.S.C. - SEYMOUR CENTER,1249,7/25/2024",
"400125779,150A NORIMETER,1358,7/28/2024",
"400125796,103A EAST FIELD HOUSE,1905,7/28/2024",
"400125821,OAKES COLLEGE,1333,7/29/2024",
"400125842,103A EAST FIELD HOUSE,1333,8/1/2024",
"400125905,112 CORE WEST STRUCTURE,1529,8/3/2024",
"400125907,FARM CASFS,1747,8/3/2024",
"400125910,103A EAST FIELD HOUSE,1807,8/3/2024",
"400125916,113 THIMANN LAB,1939,8/3/2024",
"400125927,102 QUARRY PLAZA,12:35 PM,8/4/2024",
"400125930,101 HAHN STUDENT SERVICES,1315,8/4/2024",
"400125931,101 HAHN STUDENT SERVICES,1318,8/4/2024",
"400125933,101 HAHN STUDENT SERVICES,1324,8/4/2024",
"400125934,101 HAHN STUDENT SERVICES,1327,8/4/2024",
"400125940,120A LOWER MCHENRY LIBRARY,1424,8/4/2024",
"400125944,150A NORIMETER,1536,8/4/2024",
"400125945,113 THIMANN LAB,1548,8/4/2024",
"400125949,103A EAST FIELD HOUSE,1742,8/4/2024",
"400125956,111A CROWN COLLEGE PIT,1935,8/4/2024",
"400125957,111A CROWN COLLEGE PIT,1941,8/4/2024",
"400125959,111A CROWN COLLEGE PIT,1949,8/4/2024",
"400125964,111A CROWN COLLEGE PIT,0811,8/7/2024",
"400125965,111A CROWN COLLEGE PIT,0814,8/7/2024",
"400125966,111B CROWN COLLEGE CIRCLE,0818,8/7/2024",
"400125969,115 CARRIAGE HOUSE,0913,8/7/2024",
"400125975,104 EAST REMOTE,1030,8/7/2024",
"400125978,103A EAST FIELD HOUSE,1056,8/7/2024",
"400125980,103A EAST FIELD HOUSE,1104,8/7/2024",
"400125981,103A EAST FIELD HOUSE,1107,8/7/2024",
"400125986,112 CORE WEST STRUCTURE,1200,8/7/2024",
"400125987,112 CORE WEST STRUCTURE,1203,8/7/2024",
"400125988,112 CORE WEST STRUCTURE,1217,8/7/2024",
"400125991,112 CORE WEST STRUCTURE,1233,8/7/2024",
"400125997,115 CARRIAGE HOUSE,1413,8/7/2024",
"400126000,116 CAMPUS FACILITIES,1425,8/7/2024",
"400126001,116 CAMPUS FACILITIES,1427,8/7/2024",
"400126004,165 JOHN R. LEWIS COLLEGE,1503,8/7/2024",
"400126006,139B COMMUNICATIONS,1514,8/7/2024",
"400126011,120A LOWER MCHENRY LIBRARY,1549,8/7/2024",
"400126013,120A LOWER MCHENRY LIBRARY,1554,8/7/2024",
"400126014,113 THIMANN LAB,1601,8/7/2024",
"400126016,149 HELLER EXTENSION,1620,8/7/2024",
"400126017,138 BASKIN ENGINEERING,1627,8/7/2024",
"400126027,111A CROWN COLLEGE PIT,0942,8/8/2024",
"400126029,111A CROWN COLLEGE PIT,0948,8/8/2024",
"400126032,111B CROWN COLLEGE CIRCLE,1003,8/8/2024",
"400126033,111B CROWN COLLEGE CIRCLE,1013,8/8/2024",
"400126035,111A CROWN COLLEGE PIT,1023,8/8/2024",
"400126040,111A CROWN COLLEGE PIT,1038,8/8/2024",
"400126043,111A CROWN COLLEGE PIT,1050,8/8/2024",
"400126048,156 FIRE HOUSE,1115,8/8/2024",
"400126053,152 CROWN - MERRILL APARTMENTS,1134,8/8/2024",
"400126054,152 CROWN - MERRILL APARTMENTS,1138,8/8/2024",
"400126056,165 JOHN R. LEWIS COLLEGE,1211,8/8/2024",
"400126063,166 COLLEGE NINE,1246,8/8/2024",
"400126064,164 JOHN R. LEWIS COLLEGE,1253,8/8/2024",
"400126068,ACADEMIC RESOURCE CENTER,1504,8/8/2024",
"400126071,120A LOWER MCHENRY LIBRARY,1514,8/8/2024",
"400126074,162 OAKES COLLEGE,1536,8/8/2024",
"400126078,111A CROWN COLLEGE PIT,1635,8/8/2024",
"400126079,111B CROWN COLLEGE CIRCLE,0812,8/9/2024",
"400126081,111B CROWN COLLEGE CIRCLE,0819,8/9/2024",
"400126082,111A CROWN COLLEGE PIT,0836,8/9/2024",
"400126083,111A CROWN COLLEGE PIT,0841,8/9/2024",
"400126086,111A CROWN COLLEGE PIT,0848,8/9/2024",
"400126087,111A CROWN COLLEGE PIT,0850,8/9/2024",
"400126088,111A CROWN COLLEGE PIT,0856,8/9/2024",
"400126089,111A CROWN COLLEGE PIT,0859,8/9/2024",
"400126094,156 FIRE HOUSE,0947,8/9/2024",
"400126096,154 CROWN - MERRILL APARTMENTS,0954,8/9/2024",
"400126097,152 CROWN - MERRILL APARTMENTS,1011,8/9/2024",
"400126100,107 COWELL - STEVENSON,1047,8/9/2024",
"400126103,108 STEVENSON SERVICE ROAD,1058,8/9/2024",
"400126111,103A EAST FIELD HOUSE,1145,8/9/2024",
"400126117,103A EAST FIELD HOUSE,1220,8/9/2024",
"400126118,103A EAST FIELD HOUSE,1226,8/9/2024",
"400126121,168 AGROECOLOGY,1259,8/9/2024",
"400126126,139B COMMUNICATIONS,1504,8/9/2024",
"400126127,139B COMMUNICATIONS,1506,8/9/2024",
"400126129,111B CROWN COLLEGE CIRCLE,0811,8/15/2024",
"400126130,111B CROWN COLLEGE CIRCLE,0816,8/15/2024",
"400126131,111A CROWN COLLEGE PIT,0830,8/15/2024",
"400126132,111A CROWN COLLEGE PIT,0833,8/15/2024",
"400126134,111A CROWN COLLEGE PIT,0845,8/15/2024",
"400126135,111A CROWN COLLEGE PIT,0849,8/15/2024",
"400126136,111A CROWN COLLEGE PIT,0856,8/15/2024",
"400126138,152 CROWN - MERRILL APARTMENTS,0914,8/15/2024",
"400126139,152 CROWN - MERRILL APARTMENTS,0917,8/15/2024",
"400126140,155 CROWN - MERRILL APARTMENTS,0923,8/15/2024",
"400126143,156 FIRE HOUSE,0940,8/15/2024",
"400126145,110 STEVENSON COLLEGE,1011,8/15/2024",
"400126146,109 STEVENSON COLLEGE,1017,8/15/2024",
"400126147,109 STEVENSON COLLEGE,1023,8/15/2024",
"400126151,102 QUARRY PLAZA,1147,8/15/2024",
"400126152,120A LOWER MCHENRY LIBRARY,1200,8/15/2024",
"400126156,112 CORE WEST STRUCTURE,1417,8/15/2024",
"400126160,112 CORE WEST STRUCTURE,1456,8/15/2024",
"400126161,112 CORE WEST STRUCTURE,1500,8/15/2024",
"400126163,161 OAKES COLLEGE,0806,8/16/2024",
"400126164,162 OAKES COLLEGE,0816,8/16/2024",
"400126168,133 FAMILY STUDENT HOUSING - 500 LOO,0848,8/16/2024",
"400126171,131 FAMILY STUDENT HOUSING - 300 LOO,0916,8/16/2024",
"400126176,THIMANN LABS,1404,8/16/2024",
"400126177,113 THIMANN LAB,1443,8/16/2024",
"400126179,150A NORIMETER,1510,8/16/2024",
"400126180,149 HELLER EXTENSION,1518,8/16/2024",
"400126182,149 HELLER EXTENSION,1524,8/16/2024",
"400126183,149 HELLER EXTENSION,1526,8/16/2024",
"400126185,157 GRADUATE STUDENT APARTMENTS,1537,8/16/2024",
"400126188,157 GRADUATE STUDENT APARTMENTS,1547,8/16/2024",
"400126191,112 CORE WEST STRUCTURE,1618,8/16/2024",
"400126192,112 CORE WEST STRUCTURE,1635,8/16/2024",
"400126195,119 MERRILL COLLEGE,0851,8/17/2024",
"400126199,MERRILL COLLEGE,0925,8/17/2024",
"400126200,111A CROWN COLLEGE PIT,0929,8/17/2024",
"400126201,111A CROWN COLLEGE PIT,0932,8/17/2024",
"400126203,111A CROWN COLLEGE PIT,0943,8/17/2024",
"400126205,111A CROWN COLLEGE PIT,0955,8/17/2024",
"400126206,111A CROWN COLLEGE PIT,1000,8/17/2024",
"400126207,111A CROWN COLLEGE PIT,1003,8/17/2024",
"400126208,111A CROWN COLLEGE PIT,1009,8/17/2024",
"400126210,111B CROWN COLLEGE CIRCLE,1029,8/17/2024",
"400126211,166 COLLEGE NINE,1125,8/17/2024",
"400126213,167 COLLEGE NINE,1131,8/17/2024",
"400126214,164 JOHN R. LEWIS COLLEGE,1148,8/17/2024",
"400126215,164 JOHN R. LEWIS COLLEGE,1152,8/17/2024",
"400126216,114 JOHN R. LEWIS COLLEGE,1157,8/17/2024",
"400126219,103A EAST FIELD HOUSE,1355,8/17/2024",
"400126220,103A EAST FIELD HOUSE,1402,8/17/2024",
"400126221,103A EAST FIELD HOUSE,1405,8/17/2024",
"400126222,103A EAST FIELD HOUSE,1410,8/17/2024",
"400126223,103A EAST FIELD HOUSE,1416,8/17/2024",
"400126224,103A EAST FIELD HOUSE,1423,8/17/2024",
"400126227,163 COWELL PROVOST,1440,8/17/2024",
"400126229,101 HAHN STUDENT SERVICES,1501,8/17/2024",
"400126233,101 HAHN STUDENT SERVICES,1521,8/17/2024",
"400126235,101 HAHN STUDENT SERVICES,1534,8/17/2024",
"400126240,119 MERRILL COLLEGE,0807,8/21/2024",
"400126243,111B CROWN COLLEGE CIRCLE,0841,8/21/2024",
"400126244,111B CROWN COLLEGE CIRCLE,0847,8/21/2024",
"400126245,111B CROWN COLLEGE CIRCLE,0850,8/21/2024",
"400126249,111A CROWN COLLEGE PIT,0912,8/21/2024",
"400126251,111A CROWN COLLEGE PIT,0923,8/21/2024",
"400126253,111A CROWN COLLEGE PIT,0930,8/21/2024",
"400126254,111A CROWN COLLEGE PIT,0934,8/21/2024",
"400126255,155 CROWN - MERRILL APARTMENTS,0948,8/21/2024",
"400126256,152 CROWN - MERRILL APARTMENTS,0957,8/21/2024",
"400126257,152 CROWN - MERRILL APARTMENTS,1000,8/21/2024",
"400126259,152 CROWN - MERRILL APARTMENTS,1006,8/21/2024",
"400126260,155 CROWN - MERRILL APARTMENTS,1011,8/21/2024",
"400126261,156 FIRE HOUSE,1018,8/21/2024",
"400126264,109 STEVENSON COLLEGE,1053,8/21/2024",
"400126265,107 COWELL - STEVENSON,1141,8/21/2024",
"400126266,166 COLLEGE NINE,1158,8/21/2024",
"400126268,164 JOHN R. LEWIS COLLEGE,1236,8/21/2024",
"400126270,139B COMMUNICATIONS,1424,8/21/2024",
"400126271,139B COMMUNICATIONS,1431,8/21/2024",
"400126274,150A NORIMETER,1501,8/21/2024",
"400126277,149 HELLER EXTENSION,1520,8/21/2024",
"400126279,111A CROWN COLLEGE PIT,0911,8/22/2024",
"400126280,111B CROWN COLLEGE CIRCLE,0925,8/22/2024",
"400126281,111A CROWN COLLEGE PIT,0932,8/22/2024",
"400126283,150B NORIMETER,0955,8/22/2024",
"400126285,150B NORIMETER,1001,8/22/2024",
"400126286,150B NORIMETER,1005,8/22/2024",
"400126287,150B NORIMETER,1008,8/22/2024",
"400126291,113 THIMANN LAB,1102,8/22/2024",
"400126292,113 THIMANN LAB,1107,8/22/2024",
"400126293,111A CROWN COLLEGE PIT,1113,8/22/2024",
"400126295,152 CROWN - MERRILL APARTMENTS,1123,8/22/2024",
"400126296,152 CROWN - MERRILL APARTMENTS,1126,8/22/2024",
"400126298,155 CROWN - MERRILL APARTMENTS,1150,8/22/2024",
"400126300,156 FIRE HOUSE,1159,8/22/2024",
"400126301,111A CROWN COLLEGE PIT,1207,8/22/2024",
"400126304,111A CROWN COLLEGE PIT,1216,8/22/2024",
"400126305,111A CROWN COLLEGE PIT,1222,8/22/2024",
"400126307,111A CROWN COLLEGE PIT,1235,8/22/2024",
"400126311,116 CAMPUS FACILITIES,1420,8/22/2024",
"400126312,116 CAMPUS FACILITIES,1423,8/22/2024",
"400126313,116 CAMPUS FACILITIES,1425,8/22/2024",
"400126317,170 HAY BARN,1455,8/22/2024",
"400126319,168 AGROECOLOGY,1513,8/22/2024",
"400126322,104 EAST REMOTE,0827,8/23/2024",
"400126324,103A EAST FIELD HOUSE,0853,8/23/2024",
"400126325,103A EAST FIELD HOUSE,0858,8/23/2024",
"400126326,103A EAST FIELD HOUSE,0904,8/23/2024",
"400126327,103A EAST FIELD HOUSE,0907,8/23/2024",
"400126328,103A EAST FIELD HOUSE,0921,8/23/2024",
"400126330,119 MERRILL COLLEGE,0949,8/23/2024",
"400126333,111A CROWN COLLEGE PIT,1038,8/23/2024",
"400126337,116 CAMPUS FACILITIES,1252,8/23/2024",
"400126338,116 CAMPUS FACILITIES,1255,8/23/2024",
"400126339,116 CAMPUS FACILITIES,1257,8/23/2024",
"400126344,170 HAY BARN,1408,8/23/2024",
"400126345,170 HAY BARN,1411,8/23/2024",
"400126348,FARM CASFS,1510,8/23/2024",
"400126349,111B CROWN COLLEGE CIRCLE,1526,8/23/2024",
"400126350,111B CROWN COLLEGE CIRCLE,1531,8/23/2024",
"400126352,111A CROWN COLLEGE PIT,1548,8/23/2024",
"400126355,MERRILL COLLEGE APTS,0804,8/24/2024",
"400126356,MERRILL COLLEGE APTS,0806,8/24/2024",
"400126357,111A CROWN COLLEGE PIT,0813,8/24/2024",
"400126358,111A CROWN COLLEGE PIT,0819,8/24/2024",
"400126360,111A CROWN COLLEGE PIT,0830,8/24/2024",
"400126363,111A CROWN COLLEGE PIT,0847,8/24/2024",
"400126364,111B CROWN COLLEGE CIRCLE,0904,8/24/2024",
"400126367,111B CROWN COLLEGE CIRCLE,0939,8/24/2024",
"400126369,154 CROWN - MERRILL APARTMENTS,1013,8/24/2024",
"400126370,155 CROWN - MERRILL APARTMENTS,1018,8/24/2024",
"400126373,152 CROWN - MERRILL APARTMENTS,1032,8/24/2024",
"400126376,164 JOHN R. LEWIS COLLEGE,1147,8/24/2024",
"400126377,164 JOHN R. LEWIS COLLEGE,1155,8/24/2024",
"400126378,164 JOHN R. LEWIS COLLEGE,1200,8/24/2024",
"400126381,127 WEST REMOTE,1427,8/24/2024",
"400126384,146 RACHEL CARSON COLLEGE,1523,8/24/2024",
"400126386,126 PERFORMING ARTS,1540,8/24/2024",
"400126387,126 PERFORMING ARTS,1542,8/24/2024",
"400126389,126 PERFORMING ARTS,1558,8/24/2024",
"400126390,126 PERFORMING ARTS,1610,8/24/2024",
"400126394,131 FAMILY STUDENT HOUSING - 300 LOO,0925,8/28/2024",
"400126395,135 FAMILY STUDENT HOUSING - 700 LOO,0929,8/28/2024",
"400126397,135 FAMILY STUDENT HOUSING - 700 LOO,0934,8/28/2024",
"400126398,149 HELLER EXTENSION,0949,8/28/2024",
"400126402,162 OAKES COLLEGE,1100,8/28/2024",
"400126403,RACHEL CARSON COLLEGE,1126,8/28/2024",
"400126405,126  126 PERFORMING ARTS,1148,8/28/2024",
"400126406,126  126 PERFORMING ARTS,1151,8/28/2024",
"400126407,126  126 PERFORMING ARTS,1155,8/28/2024",
"400126409,103A EAST FIELD HOUSE,1221,8/28/2024",
"400126410,103A EAST FIELD HOUSE,1225,8/28/2024",
"400126412,103A EAST FIELD HOUSE,1240,8/28/2024",
"400126413,103A EAST FIELD HOUSE,1251,8/28/2024",
"400126417,104 EAST REMOTE,1430,8/28/2024",
"400126418,104 EAST REMOTE,1434,8/28/2024",
"400126419,104 EAST REMOTE,1437,8/28/2024",
"400126420,104 EAST REMOTE,1440,8/28/2024",
"400126423,104 EAST REMOTE,1450,8/28/2024",
"400126425,104 EAST REMOTE,1459,8/28/2024",
"400126431,108 STEVENSON SERVICE ROAD,0810,8/29/2024",
"400126432,109 STEVENSON COLLEGE,0828,8/29/2024",
"400126433,103A EAST FIELD HOUSE,0851,8/29/2024",
"400126436,150B NORIMETER,0915,8/29/2024",
"400126437,150B NORIMETER,0919,8/29/2024",
"400126439,145 KRESGE COLLEGE,0959,8/29/2024",
"400126440,145 KRESGE COLLEGE,1001,8/29/2024",
"400126441,145 KRESGE COLLEGE,1003,8/29/2024",
"400126442,145 KRESGE COLLEGE,1005,8/29/2024",
"400126444,145 KRESGE COLLEGE,1010,8/29/2024",
"400126445,145 KRESGE COLLEGE,1019,8/29/2024",
"400126448,145 KRESGE COLLEGE,1026,8/29/2024",
"400126449,146 RACHEL CARSON COLLEGE,1053,8/29/2024",
"400126451,168 AGROECOLOGY,1123,8/29/2024",
"400126452,168 AGROECOLOGY,1127,8/29/2024",
"400126456,103A EAST FIELD HOUSE,1216,8/29/2024",
"400126458,102 QUARRY PLAZA,1227,8/29/2024",
"400126459,101 HAHN STUDENT SERVICES,1234,8/29/2024",
"400126460,101 HAHN STUDENT SERVICES,1242,8/29/2024",
"400126461,101 HAHN STUDENT SERVICES,1251,8/29/2024",
"400126463,101 HAHN STUDENT SERVICES,1259,8/29/2024",
"400126466,101 HAHN STUDENT SERVICES,1308,8/29/2024",
"400126468,111B CROWN COLLEGE CIRCLE,1510,8/29/2024",
"400126469,152 CROWN - MERRILL APARTMENTS,1517,8/29/2024",
"400126470,152 CROWN - MERRILL APARTMENTS,1520,8/29/2024",
"400126471,156 FIRE HOUSE,1528,8/29/2024",
"400126472,152 CROWN - MERRILL APARTMENTS,1533,8/29/2024",
"400126473,152 CROWN - MERRILL APARTMENTS,1534,8/29/2024",
"400126475,112 CORE WEST STRUCTURE,1609,8/29/2024",
"400126476,112 CORE WEST STRUCTURE,1612,8/29/2024",
"400126478,112 CORE WEST STRUCTURE,1620,8/29/2024",
"400126479,113 THIMANN LAB,1631,8/29/2024",
"400126480,RACHEL CARSON COLLEGE,0834,8/30/2024",
"400126482,136 FAMILY STUDENT HOUSING - 800 LOO,0858,8/30/2024",
"400126484,130 FAMILY STUDENT HOUSING - 200 LOO,0946,8/30/2024",
"400126485,131 FAMILY STUDENT HOUSING - 300 LOO,0950,8/30/2024",
"400126487,131 FAMILY STUDENT HOUSING - 300 LOO,0958,8/30/2024",
"400126488,133 FAMILY STUDENT HOUSING - 500 LOO,1005,8/30/2024",
"400126490,125 PORTER COLLEGE,1035,8/30/2024",
"400126491,126 PERFORMING ARTS,1113,8/30/2024",
"400126494,126 PERFORMING ARTS,1126,8/30/2024",
"400126496,THEATER ARTS CENTER,1137,8/30/2024",
"400126498,120A LOWER MCHENRY LIBRARY,1154,8/30/2024",
"400126499,112 CORE WEST STRUCTURE,1222,8/30/2024",
    ];

    try {
        // Filter the array to remove duplicate entries
        const uniqueDataArray = [...new Set(dataArray)];

        // Parse the array data into an array of objects
        allSightings = uniqueDataArray.map(sighting => {
            const [citationNumber, locationOccurred, timeOccurred, dateOccurred] = sighting.split(',');

            // Parse date with support for both single and double-digit day/month
            let [month, day, year] = dateOccurred.split('/');
            
            // Add leading zeros if necessary
            month = month.padStart(2, '0');
            day = day.padStart(2, '0');

            // Parse time, supporting both "HHmm", "Hmm", and "h:mm AM/PM" formats
            let hour, minute;
            if (timeOccurred.includes(':')) {
                // Time is in "h:mm AM/PM" format
                const [time, period] = timeOccurred.split(' ');
                [hour, minute] = time.split(':').map(str => parseInt(str, 10));

                // Convert to 24-hour format if necessary
                if (period === 'PM' && hour !== 12) {
                    hour += 12;
                } else if (period === 'AM' && hour === 12) {
                    hour = 0; // Midnight case
                }
            } else {
                // Time is in "HHmm" or "Hmm" format
                if (timeOccurred.length === 3) {
                    // Time is in "Hmm" format
                    hour = parseInt(timeOccurred.substring(0, 1), 10);
                    minute = parseInt(timeOccurred.substring(1, 3), 10);
                } else {
                    // Time is in "HHmm" format
                    hour = parseInt(timeOccurred.substring(0, 2), 10);
                    minute = parseInt(timeOccurred.substring(2, 4), 10);
                }
            }

            // Combine date and time
            const formattedDate = new Date(`${year}-${month}-${day}T${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00Z`);

            return {
                college: locationOccurred || 'Unavailable',
                time_exact: formattedDate.toISOString(), // Store as ISO string for consistency
                citationNumber: citationNumber || 'Unavailable',
                licensePlate: 'Unavailable' // You might want to add this field if it exists
            };
        });
        console.log(allSightings);
        
        // Update the header with most recent location
        const sortedForHeader = [...allSightings].sort((a, b) => 
            new Date(b.time_exact) - new Date(a.time_exact)
        );
        if (sortedForHeader.length > 0) {
            const mostRecent = sortedForHeader[0];
            document.getElementById('recentHeader').innerHTML = `<center>TAPS recently spotted at: <br><u> ${mostRecent.college}</u></center>`;
        }
        
        displaySightings();
        populatePredictionLocationDropdown();
        
        // Initialize map if Google Maps is loaded
        if (typeof google !== 'undefined' && google.maps) {
            initMap();
        }
    } catch (error) {
        console.error("Error processing sightings data:", error);
    }
}

function populatePredictionLocationDropdown() {
    const selectElement = document.getElementById("predictionLocation");
    selectElement.innerHTML = ''; // Clear existing options

    let uniqueColleges = new Set(allSightings.map(sighting => sighting.college)); // Get unique colleges

    let numericOptions = [];
    let nonNumericOptions = [];

    uniqueColleges.forEach(college => {
        if (college !== 'Unavailable') { // Avoid adding 'Unavailable' as an option
            if (/^\d+/.test(college)) {
                numericOptions.push(college);
            } else {
                nonNumericOptions.push(college);
            }
        }
    });

    // Sort numeric options by numbers
    numericOptions.sort((a, b) => {
        return parseInt(a.match(/^\d+/)[0]) - parseInt(b.match(/^\d+/)[0]);
    });

    // Sort non-numeric options alphabetically
    nonNumericOptions.sort();

    // Combine sorted arrays
    const sortedOptions = numericOptions.concat(nonNumericOptions);

    sortedOptions.forEach(college => {
        const option = document.createElement("option");
        option.value = college;
        option.textContent = college;
        selectElement.appendChild(option);
    });
    // Populate Dev Tools with list of all citation locations
    const devToolsListEl = document.getElementById("devToolsList");
    if (devToolsListEl) {
        devToolsListEl.textContent = sortedOptions.join(", ");
    }
}












function prepareDataForGraph(selectedLocation) {
    const hoursArray = new Array(24).fill(0);
    
    allSightings.forEach(sighting => {
        if (sighting.college === selectedLocation && sighting.time_exact !== 'Unavailable') {
            // Extract hour directly from time_exact without any adjustments
            const timeStr = sighting.time_exact.padStart(4, '0'); // Ensure the time is 4 characters long
            const hour = parseInt(timeStr.substring(11, 13), 10); // Extract the hour

            if (!isNaN(hour) && hour >= 0 && hour < 24) {
                hoursArray[hour]++;
            }
        }
    });

    console.log("Data prepared for graph:", hoursArray); // Log the prepared data
    return hoursArray;
}





function plotGraph(data, selectedLocation) {
    const ctx = document.getElementById('hourlyCitationChart').getContext('2d');
    // Create labels in 12-hour time format
    const labels = Array.from({ length: 24 }, (_, i) => {
        const amPm = i >= 12 ? 'PM' : 'AM'; // Determine AM/PM
        const hour = i % 12 || 12; // Convert 24-hour time to 12-hour format
        return `${hour}:00 ${amPm}`; // Return formatted label
    });

    if (window.myBarChart) {
        window.myBarChart.destroy(); // Destroy existing chart instance if it exists
    }

    window.myBarChart = new Chart(ctx, {
        type: 'line', // Use a line chart
        data: {
            labels: labels,
            datasets: [{
                label: `Number of citations at ${selectedLocation}`,
                data: data,
                backgroundColor: 'rgba(54, 162, 235, 0.2)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 5,
                tension: 0.4 // Smooth the line
            }]
        },
        options: {
            scales: {
                y: {
                    beginAtZero: true
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: `Number of citations at ${selectedLocation}`,
                    font: {
                        size: 25  // Increase this value for larger text
                    }
                }
            }
        }
    });
}



// Call this function to populate the dropdown after defining it
populatePredictionLocationDropdown();
function calculatePrediction() {
    const selectedLocation = document.getElementById('predictionLocation').value;
    const selectedHour = parseInt(document.getElementById('predictionTime').value.split(':')[0], 10);
    console.log(`Selected Location: ${selectedLocation}`);
    console.log(`Selected Hour: ${selectedHour}`);
    
    const citationDataByHour = prepareDataForGraph(selectedLocation);

    if (citationDataByHour.every(item => item === 0)) {
        console.log("No citation data available for the selected hour and location.");
    } else {
        plotGraph(citationDataByHour, selectedLocation);
    }

    const citationsAtLocation = allSightings.filter(sighting => sighting.college === selectedLocation);
    console.log(`Total citations at ${selectedLocation}: ${citationsAtLocation.length}`);

    const citationsAtLocationAndTime = citationsAtLocation.filter(sighting => {
        const correctedDateStr = correctDateFormat(sighting.time_exact);
        const sightingTime = new Date(correctedDateStr);
        sightingTime.setHours(sightingTime.getHours() + 7); // Offset time by 7 hours for calculation
        console.log(`Adjusted Sighting Time: ${sightingTime}`);
        if (isNaN(sightingTime.getTime())) {
            console.log(`Invalid date detected: ${sighting.time_exact}, Citation #${sighting.citationNumber}`);
            return false;
        }
        return sightingTime.getHours() === selectedHour;
    });

    const countCitationsAtLocation = citationsAtLocation.length;
    const countCitationsAtLocationAndTime = citationsAtLocationAndTime.length;
    const percentChance = countCitationsAtLocation > 0 ? (countCitationsAtLocationAndTime / countCitationsAtLocation * 100).toFixed(2) : 0;

    console.log(`Citations at ${selectedLocation} for the selected hour (${selectedHour}:00): ${countCitationsAtLocationAndTime}`);
    console.log(`Your chances of getting a ticket are ${percentChance}%`);

    let resultsHtml = ``;
	//Total citations at ${selectedLocation}: ${countCitationsAtLocation}<br>`;
    //resultsHtml += `Citations at ${selectedLocation} for the selected hour (${selectedHour}:00): ${countCitationsAtLocationAndTime}<br>`;
    resultsHtml += ` <br><h1> Your chances of getting a ticket are <b>${percentChance}%</b></h1>`;

    if (citationsAtLocation.length > 0) {
        resultsHtml += "<ul>";
        citationsAtLocation.forEach(sighting => {
            const correctedDateStr = correctDateFormat(sighting.time_exact);
            const sightingTime = new Date(correctedDateStr);
            if (!isNaN(sightingTime.getTime())) {
                sightingTime.setHours(sightingTime.getHours() + 7); // Offset time by 7 hours for display
                //resultsHtml += `<li>${sighting.college} - ${sightingTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}</li>`;
            } else {
                //resultsHtml += `<li>${sighting.college}: - Invalid date format</li>`;
            }
        });
        resultsHtml += "</ul>";
    } else {
        resultsHtml += "No citations have been recorded at this location.";
    }

    document.getElementById('predictionResult').innerHTML = resultsHtml;
}

function correctDateFormat(dateStr) {
    let parts = dateStr.split('T');
    if (parts.length < 2) {
        return dateStr;
    }
    let dateParts = parts[0].split('-');
    if (dateParts[1] > 12) {
        let temp = dateParts[1];
        dateParts[1] = dateParts[2];
        dateParts[2] = temp;
    }
    dateParts = dateParts.map(part => part.padStart(2, '0'));
    let correctedDateStr = `${dateParts.join('-')}T${parts[1]}`;
    return correctedDateStr;
}












// Initialize prediction locations dropdown (you could reuse populateLocationDropdown() or create a similar function for the prediction dropdown)
populateLocationDropdown();






// Global variable to keep track of markers
var sightingMarkers = [];

// Global variable to keep track of whether we are showing all sightings or just the most recent 3
var showingAllSightings = false;


function displaySightings() {
    const container = document.getElementById("sightingsContainer");
    container.innerHTML = ""; // Clear the container

    sightingMarkers.forEach(marker => marker.setMap(null));
    sightingMarkers = [];

    if (allSightings.length === 0) {
        container.innerHTML = '<div class="item">No Data Available</div>';
        return;
    }

    // Sort allSightings by timeOccurred from newest to oldest
    allSightings.sort((a, b) => b.time_exact.localeCompare(a.time_exact));

    const sightingsToShow = showingAllSightings ? allSightings : allSightings.slice(0, 3);

    sightingsToShow.forEach(sighting => {
        let div = document.createElement("div");
        div.className = "item";

        if (sighting.time_exact) {
            let sightingDateTime = new Date(sighting.time_exact);

            // Add 8 hours to the time for display purposes only
            sightingDateTime.setHours(sightingDateTime.getHours() + 8);

            const formattedDate = sightingDateTime.toLocaleDateString(); // e.g., 11/18/2019
            const formattedTime = sightingDateTime.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: 'numeric',
                hour12: true
            }); // e.g., 1:00 PM

            div.innerHTML = `
                <center>
                <div class="sighting-location">${sighting.college}</div>
                <div>${formattedDate} (${formattedTime})</div>
                
            `;
        } else {
            div.innerHTML = `
                <center>
                <div class="sighting-location">${sighting.college}</div>
                <div>Invalid date format</div>
                
            `;
        }

        container.appendChild(div);
    });

    calculatePrediction(); // Ensure the prediction function doesn't apply the 8-hour shift
    document.getElementById("toggleSightingsButton").textContent = showingAllSightings ? "Show Less" : "Show More";
}






function toggleSightingsDisplay() {
    showingAllSightings = !showingAllSightings;
    displaySightings();
}





function rad(x) {return x*Math.PI/180;}

function findNearby(position){
    let smallest = [];
    var lat = position.coords.latitude;
    var lng = position.coords.longitude;
    var R = 6371; // radius of earth in km
    var distances = [];
    var closest = -1;
    for( i=0;i<colleges.length; i++ ) {
        var mlat = colleges[i].lat;
        var mlng = colleges[i].lng;
        var dLat  = rad(mlat - lat);
        var dLong = rad(mlng - lng);
        var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(rad(lat)) * Math.cos(rad(lat)) * Math.sin(dLong/2) * Math.sin(dLong/2);
        var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        var d = R * c;
        distances[i] = d;
        smallest[i]= {d: d, obj: colleges[i]};
        if ( closest == -1 || d < distances[closest] ) {
            closest = i;
        }
    }
    smallest.sort((a,b) => a.d - b.d);
    console.log(smallest);
    displayLocation(smallest);
}




/* ────────────────────────────────────────────────────────────── *
 *  3.  submitCitationSetup – single canonical version            *
 *      – shows “hang‑tight” instantly                            *
 *      – pulls profile data from cookies or /users collection    *
 *      – writes request to /new_users for back‑end verification  *
 * ────────────────────────────────────────────────────────────── */
async function submitCitationSetup () {
  const inputEl   = document.getElementById('citationNumberSetup');
  const buttonEl  = document.getElementById('submitCitationSetup');
  const promptEl  = document.getElementById('setupPrompt') ||
                    document.querySelector('#accountSection p');

  const citationNumber = (inputEl?.value || '').trim();
  if (!citationNumber) {
    alert('Please enter a citation number.');
    return;
  }

  /* instant “hang‑tight” UI */
  if (promptEl) promptEl.textContent =
      'Please give us a moment to verify your account…';
  if (inputEl)  inputEl.style.display = 'none';
  if (buttonEl) buttonEl.style.display = 'none';

  /* ----------------------------------------------------------------
     1.  basic identity                                              */
  const user   = firebase.auth().currentUser || {};          // may be {}
  const email  = !user.isAnonymous ? user.email
                                   : getCookie('userEmail')  || '';

  /* ----------------------------------------------------------------
     2.  fullName / licensePlate – cookies first, then /users lookup */
  let fullName     = getCookie('userFullName')     || '';
  let licensePlate = getCookie('userLicensePlate') || '';

  if ((!fullName || !licensePlate) && user.uid && !user.isAnonymous) {
    try {
      const snap  = await db.collection('users').doc(user.uid).get();
      if (snap.exists) {
        const data = snap.data() || {};
        if (!fullName && data.fullName) {
          fullName = data.fullName;
          setCookie('userFullName', fullName, 30);
        }
        if (!licensePlate && data.licensePlate) {
          licensePlate = data.licensePlate;
          setCookie('userLicensePlate', licensePlate, 30);
        }
      }
    } catch (err) {
      console.warn('Could not fetch profile data:', err);
    }
  }

  /* ----------------------------------------------------------------
     3.  write request to /new_users                                 */
  try {
    await db.collection('new_users').add({
      email,
      fullName,
      licensePlate,
      citationNumber,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

    /* locally mark setup complete so prompt disappears next load */
    setCookie('finishedSetup', 'done', 30);
    if (promptEl) promptEl.textContent =
        'Give us a moment to verify your account';

  } catch (err) {
    alert('Error submitting citation: ' + err.message);
    if (promptEl) promptEl.textContent =
        'Something went wrong – please try again.';
    if (inputEl)  inputEl.style.display = '';
    if (buttonEl) buttonEl.style.display = '';
  }
}





function displayLocation(smallest){
    
		
		
		
    for (let i = 0; i < 5; i++){
		
		if(i == 0){
		var para = document.createElement("p");
		var node = document.createTextNode("Pick A Location Near You");
		para.appendChild(node);
		var element = document.getElementById("locations");
		element.appendChild(para);

		var para = document.createElement("br");
		var element = document.getElementById("locations");
		element.appendChild(para);
		
		}
		
		//if(i == 1){
		let div = document.createElement("div");
        div.className = "item";
        div.addEventListener('click',function(){
            reportSighting(smallest[i].obj.name);
         });
        div.innerHTML = `<div class="sighting-location">${smallest[i].obj.name}</div>`;
        document.getElementById("locations").appendChild(div);
		//}
        
		
		
	
	
		
    }
}
function error(errorObj){
    alert(errorObj.code + ": " + errorObj.message); 
    let div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `<div class="sighting-location">Geolocation not supportet</div>`;
    document.getElementById("locations").appendChild(div);
}
function currentLocation(){
    document.getElementById("locations").innerHTML="";
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(findNearby,error,{enableHighAccuracy: true, maximumAge: 10000});
      } else {
        let div = document.createElement("div");
        div.className = "item";
        div.innerHTML = `<div class="sighting-location">Geolocation not supportet</div>`;
        document.getElementById("locations").appendChild(div);
      }
}

fetchSightings();	
	
	
	
	
	
	
	
	
	
	
// Enhance showSignUpForm to autopopulate fields from cookies if present
function showSignUpForm() {
  const firstName = getCookie('userFullName')
                   ? toTitleCase(getCookie('userFullName').split(' ')[0]) : '';
const lastName  = getCookie('userFullName')
                   ? toTitleCase(getCookie('userFullName').split(' ').slice(1).join(' ')) : '';
  const email = getCookie('userEmail') || '';
  const licensePlate = getCookie('userLicensePlate') || '';
  const password = getCookie('userPassword') || '';
  document.getElementById('accountFormFields').innerHTML = `
    <input type="text" id="signupFirstName" placeholder="First Name" value="${firstName}" style="margin-bottom:10px;width:80%;height:40px;font-size:18px;border-radius:20px;text-align:center;"><br>
    <input type="text" id="signupLastName" placeholder="Last Name" value="${lastName}" style="margin-bottom:10px;width:80%;height:40px;font-size:18px;border-radius:20px;text-align:center;"><br><br>
    <br><br><input type="email" id="signupEmail" placeholder="Email" value="${email}" style="margin-bottom:10px;width:80%;height:40px;font-size:18px;border-radius:20px;text-align:center;"><br>
    <input type="text" id="signupLicensePlate" placeholder="License Plate" value="${licensePlate}" style="margin-bottom:10px;width:80%;height:40px;font-size:18px;border-radius:20px;text-align:center;"><br><br>
    <br><br><input type="password" id="signupPassword" placeholder="Password" value="${password}" style="margin-bottom:10px;width:80%;height:40px;font-size:18px;border-radius:20px;text-align:center;"><br>
    <input type="password" id="signupConfirmPassword" placeholder="Confirm Password" value="${password}" style="margin-bottom:10px;width:80%;height:40px;font-size:18px;border-radius:20px;text-align:center;"><br>
  `;
  document.getElementById('signUpButton').style.display = '';
  document.getElementById('signUpButton').innerHTML = '<h3>Sign&nbsp;Up</h3>';
  document.getElementById('signUpButton').onclick = submitSignUp;
  document.getElementById('loginButton').innerHTML = '<h3>Back</h3>';
  document.getElementById('loginButton').onclick = resetAccountSection;
  document.getElementById('loginButton').style.display = '';
}




function setCookie(name, value, days) {
  let expires = '';
  if (days) {
    const date = new Date();
    date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
    expires = '; expires=' + date.toUTCString();
  }
  document.cookie = name + '=' + encodeURIComponent(value) + expires + '; path=/';
}
function getCookie(name) {
  const nameEQ = name + '=';
  const ca = document.cookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) === ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) === 0) return decodeURIComponent(c.substring(nameEQ.length, c.length));
  }
  return null;
}
function eraseCookie(name) {
  document.cookie = name + '=; Max-Age=-99999999; path=/';
}








async function submitSignUp () {
  const firstNameRaw   = document.getElementById('signupFirstName').value.trim();
  const lastNameRaw    = document.getElementById('signupLastName').value.trim();

  const firstName      = toTitleCase(firstNameRaw);
  const lastName       = toTitleCase(lastNameRaw);
  const email          = document.getElementById('signupEmail').value.trim();
  const licensePlate   = document.getElementById('signupLicensePlate').value.trim();
  const password       = document.getElementById('signupPassword').value;
  const confirmPassword= document.getElementById('signupConfirmPassword').value;

  if (!firstName || !lastName || !email || !licensePlate || !password || !confirmPassword) {
    alert('Please fill in all fields.');
    return;
  }
  if (password !== confirmPassword) {
    alert('Passwords do not match.');
    return;
  }

  try {
    await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    const { user } = await firebase.auth().createUserWithEmailAndPassword(email, password);

    // 🔥 store extra profile data
   await db.collection('users').doc(user.uid).set({
    fullName     : `${firstName} ${lastName}`,   // already title‑cased!
      email        : email,
      licensePlate : licensePlate
    });

    // 🐞  NEW ➜ immediately cache cookies – we cannot rely on the
    //      asynchronous onAuthStateChanged to have completed before
    //      the user submits their citation.
    setCookie('userFullName', `${firstName} ${lastName}`, 30);
    setCookie('userEmail', email, 30);
    setCookie('userLicensePlate', licensePlate, 30);

    // auth listener will still refresh the UI
  } catch (error) {
    if (error.code === 'auth/email-already-in-use') {
      alert('This email is already in use. Please log in instead.');
    } else {
      alert('Sign up failed: ' + error.message);
    }
  }
}

async function submitLogin () {
  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  if (!email || !password) {
    alert('Please enter your email and password.');
    return;
  }

  try {
    await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    const { user } = await firebase.auth().signInWithEmailAndPassword(email, password);

    /* NEW — fetch the extra profile data you store in /users ... */
    const snap    = await db.collection('users').doc(user.uid).get();
    const profile = snap.exists ? snap.data() : {};

    /* ...and cache it so submitCitationSetup has everything it needs */
    setCookie('userFullName',     profile.fullName     || '', 30);
    setCookie('userEmail',        user.email           || '', 30);
    setCookie('userLicensePlate', profile.licensePlate || '', 30);

    /* the auth state listener will take care of rebuilding the UI */

  } catch (error) {
    alert('Login failed: ' + error.message);
  }
}


// Add a logout function
async function logout() {
  try {
    await firebase.auth().signOut();
    // Reload the page after logout is complete
    window.location.reload();
    // The auth state listener will handle clearing cookies and resetting the UI
  } catch (error) {
    console.error("Error signing out:", error);
  }
}


function goToAccount(mode) {
  window.location.href = `account.html?mode=${mode}`;
}

function resetAccountSection() {
  document.getElementById('accountFormFields').innerHTML = '';
  document.getElementById('signUpButton').style.display = '';
  document.getElementById('loginButton').innerHTML = '<h3>Log&nbsp;In</h3>';
  document.getElementById('loginButton').onclick = showLoginForm;
  document.getElementById('loginButton').style.display = '';
}
	
	
	
	







function showLoginForm() {
  document.getElementById('accountFormFields').innerHTML = `
    <input type="email" id="loginEmail" placeholder="Email" style="margin-bottom:10px;width:80%;height:40px;font-size:18px;border-radius:20px;text-align:center;"><br>
    <input type="password" id="loginPassword" placeholder="Password" style="margin-bottom:10px;width:80%;height:40px;font-size:18px;border-radius:20px;text-align:center;"><br>
  `;
  document.getElementById('signUpButton').style.display = 'none';
  document.getElementById('loginButton').innerHTML = '<h3>Log&nbsp;In</h3>';
  document.getElementById('loginButton').onclick = async function() {
    // This wraps submitLogin to ensure the back button is removed after successful login
    try {
      await submitLogin();
      // The back button will be removed by the onAuthStateChanged listener
    } catch (error) {
      console.error("Error in login:", error);
    }
  };
  
  // Add a back button if it doesn't exist
  if (!document.getElementById('backButton')) {
    const backBtn = document.createElement('button');
    backBtn.id = 'backButton';
    backBtn.innerHTML = '<h3>Back</h3>';
    backBtn.style.marginTop = '10px';
    backBtn.onclick = function() {
      document.getElementById('backButton').remove();
      resetAccountSection();
    };
    document.getElementById('accountSection').querySelector('center').appendChild(backBtn);
  }
}






// On page load, if user is logged in with Firebase, fetch their info
window.addEventListener('DOMContentLoaded', async function() {

  // Show setup prompt
  if (setupPrompt) {
    setupPrompt.style.display = '';
    setupPrompt.innerHTML = 'To finish setting up your account, please enter one of your citation numbers:';
  }

  // Show citation number input and submit button
  formFields.innerHTML = `
    <input type="text" id="citationNumberSetup" placeholder="Citation Number" style="margin-bottom:10px;width:80%;height:40px;font-size:18px;border-radius:20px;text-align:center;"><br>
    <button id="submitCitationSetup" style="margin-top:10px;width:200px;height:50px;font-size:20px;border-radius:20px;">Submit</button>
  `;
  document.getElementById('signUpButton').style.display = 'none';
  document.getElementById('loginButton').style.display = 'none';
  document.getElementById('submitCitationSetup').onclick = async () => {
  const citationNumber = document.getElementById('citationNumberSetup').value.trim();
  if (!citationNumber) {
    alert('Please enter a citation number.');
    return;
  }

  /* ──  ✱  Immediately swap UI to a “hang‑tight” message  ─────────── */
  if (setupPrompt) {
    setupPrompt.innerHTML = 'Please give us a moment to verify your account…';
  }
  document.getElementById('citationNumberSetup').remove();   // or .style.display = 'none';
  document.getElementById('submitCitationSetup').remove();    // ditto

  /*  store the request and wait for the back‑end to confirm later */
  const email = firebase.auth().currentUser?.email || getCookie('userEmail') || '';
  try {
    await db.collection('new_users').add({
      licensePlate,
      citationNumber,
      fullName,
      email,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    /* when your verification webhook runs, it should flip the user’s
       “finishedSetup” flag and the normal auth listener will rebuild the
       section without the prompt. */
  } catch (e) {
    alert('Error submitting citation: ' + e.message);
    // optional: roll back the UI if you’d like
  }
};
})


/* ────────────────────────────────────────────────────────────── *
 *  4.  showAccountSection – builds/refreshes the account UI      *
 *      – always inserts Log‑Out button                           *
 *      – mounts new “Park & get alerts” mini‑app                 *
 *      – calls loadUserTickets(email) when skeleton is ready     *
 * ────────────────────────────────────────────────────────────── */
function showAccountSection(fullName, licensePlate, finishedSetup = '') {

  /* grab the DOM shell once */
  const section     = document.getElementById('accountSection');
  const formFields  = document.getElementById('accountFormFields');
  const setupPrompt = section.querySelector('p');

  /* clean up any stray Back button from login form */
  const staleBack = document.getElementById('backButton');
  if (staleBack) staleBack.remove();

  /* hide Sign‑Up / Log‑In controls */
  document.getElementById('signUpButton').style.display = 'none';
  document.getElementById('loginButton').style.display  = 'none';

  /* personalised header */
  section.querySelector('h1').innerHTML =
      `<b><u>Welcome, ${toTitleCase(fullName)}</u></b><br><br>`;
  section.querySelector('h1').style.marginBottom = '5px';

  /* build / refresh the inner skeleton -------------------------------- */
  formFields.innerHTML = `
    <!-- 🚗 NEW parking section goes here -->
    <div id="parkingSection">
        <p style="font-size:18px;margin:6px 0;">
            <b>Park your car and receive live alerts when TAPS is nearby</b>
        </p>
        <br><button id="parkButton" class="action-btn">Park</button>
    </div><br>

    <!-- existing tickets UI (unchanged) -->
    <div id="userTicketsHeader" class="tickets-head"></div>
    <div id="userTicketsContainer"></div>
	
	 <!--
    <button id="toggleUserTickets" class="action-btn"
            style="margin-top:6px;">Show ore</button><br>-->
  `;

  /* ───────────────── Parking UI controller – fully self‑contained ─── */
  (function initParkingBlock (fullNameFromProfile) {

    const parkingDiv  = document.getElementById('parkingSection');
    const parkBtn     = document.getElementById('parkButton');

    /* ❶ Default idle state */
    parkBtn.onclick = startParkingPrompt;

    function startParkingPrompt () {
      parkingDiv.innerHTML = `
        <label><b>Choose your location</b></label><br>
        <select id="parkLocation" style="width:80%;height:40px;
                 margin:6px 0;text-align-last:center;border-radius:20px;"></select><br>
        <label><b>How many hours?</b></label><br>
        <input type="number" id="parkHours" min="1" max="24" value="2"
               style="width:120px;height:40px;font-size:18px;text-align:center;
                      border-radius:20px;margin:6px 0;"><br><br>
        <button id="confirmPark" class="action-btn">Park</button>
        <center><br><button id="cancelPark"  class="action-btn" >Cancel</button><br>
      `;
      populateParkDropdown();
      document.getElementById('confirmPark').onclick = confirmParking;
      document.getElementById('cancelPark' ).onclick = resetParkingUi;
    }

    function populateParkDropdown () {
      const sel = document.getElementById('parkLocation');
      sel.innerHTML = '';
      /* re‑use the already‑built prediction dropdown as source */
      document
        .querySelectorAll('#predictionLocation option')
        .forEach(o => sel.appendChild(o.cloneNode(true)));
    }

    async function confirmParking () {
      const loc   = document.getElementById('parkLocation').value;
      const hours = parseInt(document.getElementById('parkHours').value, 10);
      if (!hours || hours < 1) { alert('Enter a valid number of hours'); return; }

      /* write an entry to /parked_users */
      const user  = firebase.auth().currentUser || {};
      const email = user.email || getCookie('userEmail') || '';
      const name  = fullNameFromProfile || getCookie('userFullName') || '';

      const docRef = await db.collection('parked_users').add({
        email, fullName: name, location: loc, hours,
        start: firebase.firestore.FieldValue.serverTimestamp()
      });

      startCountdown(hours * 3600, docRef.id);       // jump to live state
    }

    /* ❷ Live “Scanning” state */
    let timerId = null;

    function startCountdown (seconds, docId) {
      parkingDiv.innerHTML = `
        <p style="font-size:18px;margin:6px 0;"><b>Scanning for TAPS</b></p>
        <div id="countdown" style="font-size:24px;margin:6px 0;"></div>
        <button id="stopPark" class="action-btn">Stop</button><br>
      `;
      updateCountdown(seconds);

      timerId = setInterval(() => {
        seconds--;
        if (seconds <= 0) stopParking(docId);
        else updateCountdown(seconds);
      }, 1000);

      document.getElementById('stopPark').onclick = () => stopParking(docId);
    }

    function updateCountdown (sec) {
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60).toString().padStart(2, '0');
      const s = (sec % 60).toString().padStart(2, '0');
      document.getElementById('countdown').textContent = `${h}:${m}:${s}`;
    }

    async function stopParking (docId) {
      clearInterval(timerId);
      try { await db.collection('parked_users').doc(docId).delete(); }
      catch (e) { console.warn('could not remove parked entry', e); }
      resetParkingUi();
    }

    /* ❸  Restore timer after page reload (if needed) */
    (async function resumeParkingIfNeeded () {
      const user  = firebase.auth().currentUser || {};
      const email = user.email || getCookie('userEmail') || '';
      if (!email) return;

      const snap = await db.collection('parked_users')
                            .where('email', '==', email)
                            .orderBy('start', 'desc')
                            .limit(1).get();
      if (snap.empty) return;

      const doc       = snap.docs[0];
      const data      = doc.data();
      const startedAt = data.start?.toDate?.() || new Date(data.start);
      const expiresAt = +startedAt + data.hours * 3600 * 1000;
      const remaining = Math.floor((expiresAt - Date.now()) / 1000);

      if (remaining > 0) startCountdown(remaining, doc.id);
      else               await doc.ref.delete();   // clean up stale entry
    })();

    /* helper resets to idle state */
    function resetParkingUi () {
      parkingDiv.innerHTML = `
        <p style="font-size:18px;margin:6px 0;">
          <b>Park your car and receive live alerts when TAPS is nearby</b>
        </p>
        <br><button id="parkButton" class="action-btn">Park</button>
      `;
      document.getElementById('parkButton').onclick = startParkingPrompt;
    }

    /* (optional) expose internals for dev‑tools testing */
    window.__startCountdown = startCountdown;
    window.__stopParking    = stopParking;

  })(fullName);  // IIFE receives the user’s name
  /* ─────────────────────────────────────────────────────────── */

  /* verification step – citation prompt (only if user not verified) */
  if (finishedSetup !== 'done') {
    if (setupPrompt) {
      setupPrompt.id    = 'setupPrompt';
      setupPrompt.style.display = '';
      setupPrompt.textContent   =
        'To finish setting up your account, please enter one of your citation numbers:';
    }

    formFields.insertAdjacentHTML('beforeend', `
      <input type="text" id="citationNumberSetup" placeholder="Citation Number"
             style="margin-bottom:10px;width:80%;height:40px;font-size:18px;
                    border-radius:20px;text-align:center;"><br>
      <button id="submitCitationSetup"
              style="margin-top:10px;width:200px;height:50px;font-size:20px;
                     border-radius:20px;">Submit</button>
    `);
    document.getElementById('submitCitationSetup').onclick = submitCitationSetup;

  } else if (setupPrompt) {
    setupPrompt.style.display = 'none';     // hide prompt for verified users
  }

  /* always ensure there’s a Log‑Out button */
  if (!document.getElementById('logoutButton')) {
    const lo = document.createElement('button');
    lo.id = 'logoutButton';
    lo.textContent = 'Log Out';
    lo.style.cssText =
      'margin-top:50px;width:200px;height:50px;font-size:20px;border-radius:20px;';
    lo.onclick = logout;
    formFields.appendChild(lo);
  }

  /* finally, pull the user’s saved citations */
  const email = firebase.auth().currentUser?.email || getCookie('userEmail') || '';
  if (email) loadUserTickets(email);
}









