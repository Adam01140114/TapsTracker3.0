/* ────────────────────────────────────────────────────────────── *
 *  1.  renderUserTickets                                         *
 *      – draws the user's saved citation list                    *
 *      – handles "Show More / Show Less" toggle                  *
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

/**
 * Initialize the map showing only the most-recent sighting,
 * then wire up a More/Back button to toggle to three pins + show the sightings list.
 */
/**
 * Initialize the map showing only the most-recent sighting,
 * then wire up a More/Back button to toggle to three pins + show the sightings list.
 */
function initMap() {
  // 1️⃣ create the map
  map = new google.maps.Map(document.getElementById("map"), {
    center:   { lat: 0, lng: 0 },
    zoom:     1,
    mapTypeId:"roadmap",
    styles: [{
      featureType: "poi",
      elementType: "labels",
      stylers: [{ visibility: "off" }],
    }],
  });

  // 2️⃣ setup Street View but keep it hidden
  panorama = new google.maps.StreetViewPanorama(
    document.getElementById("map"), {
      position: { lat: 0, lng: 0 },    // will be updated per-pin
      pov:      { heading: 0, pitch: 0 },
      visible:  false
    }
  );
  map.setStreetView(panorama);

  // 3️⃣ initial render: single most-recent pin
  let showingAll = false;
  renderMapPins(showingAll);

  // 4️⃣ hide the sightings list by default
  document.getElementById("sightingsContainer").style.display = "none";

  // 5️⃣ toggle button for list + extra pins
  const toggleBtn = document.getElementById("toggleSightingsButton");
  toggleBtn.textContent = "More";
  toggleBtn.addEventListener("click", () => {
    showingAll = !showingAll;
    renderMapPins(showingAll);
    document.getElementById("sightingsContainer").style.display = showingAll ? "block" : "none";
    toggleBtn.textContent = showingAll ? "Back" : "More";
  });

  // 6️⃣ Exit-Street-View button
  document.getElementById("exitStreetViewBtn").addEventListener("click", () => {
    panorama.setVisible(false);
    document.getElementById("exitStreetView").style.display = "none";
  });
}


// expose to window
window.initMap = initMap;




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
    
    // Fallback: UCSC campus center if not found
    console.warn(`No coordinates found for location: ${location}, using fallback.`);
    return { lat: 36.9916, lng: -122.0583 };
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

    refreshParkUi();   
  });
}
window.addEventListener('DOMContentLoaded', init);



var db = firebase.firestore();

// Add auth state listener
/* ───────── AUTH LISTENER ───────── */
/* ───────── MASTER AUTH LISTENER ───────── */
firebase.auth().onAuthStateChanged(async function (user) {

  /* 0.  completely signed-out ► reset UI */
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

  // Update Park section UI on auth state change
  if (!user || user.isAnonymous) {
    renderParkSection(false);
  } else {
    const snap = await db.collection('users').doc(user.uid).get();
    const profile = snap.exists ? snap.data() : {};
    const fullName = profile.fullName || '';
    renderParkSection(true, fullName);
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




// Defensive DOM access for timeOccurred and predictionTime
window.addEventListener('DOMContentLoaded', (event) => {
    const now = new Date();
    const formattedDate = now.getFullYear() + '-' +
        (now.getMonth() + 1).toString().padStart(2, '0') + '-' +
        now.getDate().toString().padStart(2, '0');
    const formattedTime = now.getHours().toString().padStart(2, '0') + ':' +
        now.getMinutes().toString().padStart(2, '0');
    const timeOccurred = document.getElementById('timeOccurred');
    if (timeOccurred) timeOccurred.value = formattedDate + 'T' + formattedTime;
    const predictionTime = document.getElementById('predictionTime');
    if (predictionTime) predictionTime.value = formattedTime;
});

window.addEventListener('DOMContentLoaded', (event) => {
    const now = new Date();
    const formattedDateTime = now.getFullYear() + '-' +
        (now.getMonth() + 1).toString().padStart(2, '0') + '-' +
        now.getDate().toString().padStart(2, '0') + 'T' +
        now.getHours().toString().padStart(2, '0') + ':' +
        now.getMinutes().toString().padStart(2, '0');
    const timeOccurred = document.getElementById('timeOccurred');
    if (timeOccurred) timeOccurred.value = formattedDateTime;
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
    if (!selectElement) return;
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
  try {
    // 1️⃣ Fetch & dedupe lines
    const res = await fetch('/scraped.txt');
    if (!res.ok) throw new Error(`Failed to fetch scraped.txt: ${res.status}`);
    const text = await res.text();
    const uniqueLines = Array.from(new Set(
      text
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(l => l)
    ));

    // 2️⃣ Parse each line
    allSightings = uniqueLines.reduce((acc, raw) => {
      // ✂️ strip ALL leading/trailing quotes + trailing commas
      const clean = raw
        .replace(/^"+/, '')
        .replace(/"+,?$/, '')
        .trim();

      const parts = clean.split(',').map(p => p.trim());
      if (parts.length !== 4) {
        console.warn('[SKIP] wrong field count:', raw);
        return acc;
      }
      const [citationNumber, locationOccurred, timeStr, dateStr] = parts;

      // 📅 parse date MM/DD/YYYY
      const [mRaw, dRaw, yRaw] = dateStr.split('/');
      const month = parseInt(mRaw, 10),
            day   = parseInt(dRaw, 10),
            year  = parseInt(yRaw, 10);
      if ([month, day, year].some(n => isNaN(n))) {
        console.warn('[SKIP] bad date:', dateStr, 'line:', raw);
        return acc;
      }

      // ⏰ parse time HHmm or Hmm
      const digits = timeStr.replace(/\D/g, '').padStart(4, '0');
      const hour   = parseInt(digits.slice(0,2), 10),
            minute = parseInt(digits.slice(2,4), 10);
      if ([hour, minute].some(n => isNaN(n) || n < 0)) {
        console.warn('[SKIP] bad time:', timeStr, 'line:', raw);
        return acc;
      }

      // 🔨 build ISO and log it
      const isoCandidate =
        `${year.toString().padStart(4,'0')}-` +
        `${String(month).padStart(2,'0')}-` +
        `${String(day).padStart(2,'0')}T` +
        `${String(hour).padStart(2,'0')}:` +
        `${String(minute).padStart(2,'0')}:00Z`;

      console.log('[DEBUG] ISO str →', isoCandidate, 'from:', raw);
      const d = new Date(isoCandidate);
      if (isNaN(d.getTime())) {
        console.error('[SKIP] invalid Date():', isoCandidate, 'line:', raw);
        return acc;
      }

      acc.push({
        citationNumber: citationNumber || 'Unavailable',
        college:        locationOccurred || 'Unavailable',
        time_exact:     d.toISOString()
      });
      return acc;
    }, []);

    // 3️⃣ Refresh UI & map
    updateHeaderAndUI();
    if (window.google && google.maps) initMap();
    // calculatePrediction(); // REMOVE THIS LINE

  } catch (err) {
    console.error('Error processing scraped.txt data:', err);
  }
}

function updateHeaderAndUI() {
  // A) "Most recent"
  const sorted = [...allSightings].sort(
    (a, b) => new Date(b.time_exact) - new Date(a.time_exact)
  );
  const hdr = document.getElementById('recentHeader');
  if (hdr) {
    hdr.innerHTML = sorted.length
      ? `<center><h1 style="font-size:5vw">TAPS recently spotted at:<br></h1><h1 style="font-size:4vw"><b><u>${sorted[0].college}</u></b></center></h1>`
      : `<h1><b><center>No sightings yet</center></b></h1>`;
  }

  // B) rebuild list + dropdown
  if (typeof displaySightings === 'function')             displaySightings();
  if (typeof populatePredictionLocationDropdown === 'function')
                                                           populatePredictionLocationDropdown();
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

   

    let resultsHtml = ``;
	//Total citations at ${selectedLocation}: ${countCitationsAtLocation}<br>`;
    //resultsHtml += `Citations at ${selectedLocation} for the selected hour (${selectedHour}:00): ${countCitationsAtLocationAndTime}<br>`;
    resultsHtml += `<br><center> <br><br><br><br><h1> Your chances of getting a ticket are <b>${percentChance}%</b></h1>`;

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
            sightingDateTime.setHours(sightingDateTime.getHours() + 8);
            const formattedDate = sightingDateTime.toLocaleDateString();
            const formattedTime = sightingDateTime.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: 'numeric',
                hour12: true
            });
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
 *      – shows "hang-tight" instantly                            *
 *      – pulls profile data from cookies or /users collection    *
 *      – writes request to /new_users for back-end verification  *
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

  /* instant "hang-tight" UI */
  if (promptEl) promptEl.innerHTML =
  '<br><br>Please give us a moment to verify your account…';

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
    if (promptEl) {
  // 1. clear out whatever was there
  promptEl.innerHTML = '';

  // 2. create your break(s)
  const br1 = document.createElement('br');
  const br2 = document.createElement('br');

  // 3. append them *before* your text
  promptEl.appendChild(br1);
  promptEl.appendChild(br2);

  // 4. then append your actual message as text
  promptEl.appendChild(
    document.createTextNode('Please give us a moment to verify your account…')
  );
}


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
    <input type="text" id="signupFirstName" placeholder="First Name" value="${firstName}" style="margin-bottom:10px;width:90%;height:50px;font-size:18px;border-radius:20px;text-align:center;"><br>
    <input type="text" id="signupLastName" placeholder="Last Name" value="${lastName}" style="margin-bottom:10px;width:90%;height:50px;font-size:18px;border-radius:20px;text-align:center;"><br><br>
    <br><input type="email" id="signupEmail" placeholder="Email" value="${email}" style="margin-bottom:10px;width:90%;height:50px;font-size:18px;border-radius:20px;text-align:center;"><br>
    <input type="text" id="signupLicensePlate" placeholder="License Plate" value="${licensePlate}" style="margin-bottom:10px;width:90%;height:50px;font-size:18px;border-radius:20px;text-align:center;"><br><br>
    <br><input type="password" id="signupPassword" placeholder="Password" value="${password}" style="margin-bottom:10px;width:90%;height:50px;font-size:18px;border-radius:20px;text-align:center;"><br>
    <input type="password" id="signupConfirmPassword" placeholder="Confirm Password" value="${password}" style="margin-bottom:10px;width:90%;height:50px;font-size:18px;border-radius:20px;text-align:center;"><br><br>
  `;
  document.getElementById('signUpButton').style.display = '';
  document.getElementById('signUpButton').innerHTML = '<h3>Sign Up</h3>';
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
    fullName     : `${firstName} ${lastName}`,   // already title-cased!
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
	
	
	
	




// ── fill the "Choose your location" <select> in the park flow
function populateParkDropdown() {
  const select = document.getElementById('parkLocation');
  select.innerHTML = ''; 

  // "Current Location" option
  const cur = document.createElement('option');
  cur.value       = '__CURRENT_LOCATION__';
  cur.textContent = 'Current Location';
  select.appendChild(cur);

  // Then each campus lot
  colleges.forEach(col => {
    const o = document.createElement('option');
    o.value       = col.name;
    o.textContent = col.name;
    select.appendChild(o);
  });
}



/**
 * Render either the single most-recent sighting or the three most-recent unique sightings.
 * @param {boolean} showAll  if true → up to 3 pins; if false → only the top-most pin
 */
function renderMapPins(showAll) {
  // clear old markers
  markers.forEach(m => m.setMap(null));
  markers.length = 0;

  // sort & pick
  const sorted = [...allSightings].sort(
    (a, b) => new Date(b.time_exact) - new Date(a.time_exact)
  );
  const seen = new Set();
  const count = showAll ? 3 : 1;
  const pinsToShow = [];
  for (let s of sorted) {
    if (pinsToShow.length >= count) break;
    if (seen.has(s.college)) continue;
    const coords = getLocationCoordinates(s.college);
    if (!coords) continue;
    seen.add(s.college);
    pinsToShow.push({ sighting: s, coords });
  }

  // build bounds
  const bounds = new google.maps.LatLngBounds();
  let tempStreetViewPin = null; // for the temporary pin
  pinsToShow.forEach(({ sighting, coords }) => {
    const when = new Date(sighting.time_exact);
    when.setHours(when.getHours() + 7);

    const marker = new google.maps.Marker({
      position: coords,
      map,
      opacity: 1.0,
      title: `${sighting.college}\n${when.toLocaleDateString()} ${when.toLocaleTimeString()}`,
      icon: {
        url: 'pin.png',
        scaledSize: new google.maps.Size(60, 100), // 60x100 pin
        anchor:    new google.maps.Point(30, 100),
        labelOrigin: new google.maps.Point(30, 30),
      },
      optimized: false
    });

    marker.addListener("click", () => {
      // Check if Street View is available at this location
      const svService = new google.maps.StreetViewService();
      svService.getPanorama({ location: coords, radius: 50 }, (data, status) => {
        let goThereButton = '';
        if (status === google.maps.StreetViewStatus.OK) {
          goThereButton = `<br><button class="sv-go-btn" style="display:flex; align-items:center; justify-content:center; font-size:1.8em; font-weight:bold; height:60px; min-width:120px; border-radius:12px; margin-top:12px; background:#007bff; color:#fff; border:none; cursor:pointer;">Go There</button>`;
        }
        const content = `
          <div style=\"font-family: 'Roboto', sans-serif; text-align:center; padding: 12px 18px 8px 18px; min-width:220px;\">
            <h3 style='font-size:2em; font-weight:bold; margin:0 0 8px 0;'>${sighting.college}</h3>
            <div style='font-size:1.7em; font-weight:bold; margin:0 0 4px 0;'>Date: ${when.toLocaleDateString()}</div>
            <div style='font-size:1.7em; font-weight:bold; margin:0 0 8px 0;'>Time: ${when.toLocaleTimeString()}</div>
            ${goThereButton}
            <div style=\"height:24px;\"></div>
          </div>`;
        const infoWindow = new google.maps.InfoWindow({ content });
        infoWindow.open(map, marker);

        // once the DOM is ready, hook up the Go There button if it exists
        google.maps.event.addListenerOnce(infoWindow, 'domready', () => {
          const btn = document.querySelector('.sv-go-btn');
          if (btn) {
            btn.addEventListener('click', () => {
              // Drop a temporary pin at this location
              if (window._tempStreetViewPin) {
                window._tempStreetViewPin.setMap(null);
                window._tempStreetViewPin = null;
              }
              window._tempStreetViewPin = new google.maps.Marker({
                position: coords,
                map: map,
                icon: {
                  url: 'http://maps.google.com/mapfiles/ms/icons/green-dot.png',
                  scaledSize: new google.maps.Size(50, 75),
                  anchor: new google.maps.Point(25, 75),
                },
                zIndex: 9999
              });
              panorama.setPosition(coords);
              panorama.setPov({ heading: 270, pitch: 0 });
              panorama.setVisible(true);
              document.getElementById('exitStreetView').style.display = '';
            });
          }
        });
      });
    });

    markers.push(marker);
    bounds.extend(coords);
  });

  // fit or center
  if (showAll) {
    map.fitBounds(bounds);
  } else if (pinsToShow.length === 1) {
    map.setCenter(bounds.getCenter());
    map.setZoom(17);
  }

  // Handle exit button to remove temp pin and hide street view
  const exitBtn = document.getElementById('exitStreetViewBtn');
  if (exitBtn) {
    exitBtn.onclick = function() {
      panorama.setVisible(false);
      document.getElementById('exitStreetView').style.display = 'none';
      if (window._tempStreetViewPin) {
        window._tempStreetViewPin.setMap(null);
        window._tempStreetViewPin = null;
      }
    };
  }
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
    setupPrompt.innerHTML = 
  '<br><br><br><br>To finish setting up your account, please enter one of your citations';

  }

  // Show citation number input and submit button
  formFields.innerHTML = `
    <input type="text" id="citationNumberSetup" placeholder="Citation Number (" style="margin-bottom:10px;width:80%;height:40px;font-size:18px;border-radius:20px;text-align:center;"><br>
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

  /* ──  ✱  Immediately swap UI to a "hang-tight" message  ─────────── */
  if (setupPrompt) {
    setupPrompt.innerHTML = 'Please give us a moment to verify your account…';
  }
  document.getElementById('citationNumberSetup').remove();   // or .style.display = 'none';
  document.getElementById('submitCitationSetup').remove();    // ditto

  /*  store the request and wait for the back-end to confirm later */
  const email = firebase.auth().currentUser?.email || getCookie('userEmail') || '';
  try {
    await db.collection('new_users').add({
      licensePlate,
      citationNumber,
      fullName,
      email,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    /* when your verification webhook runs, it should flip the user's
       "finishedSetup" flag and the normal auth listener will rebuild the
       section without the prompt. */
  } catch (e) {
    alert('Error submitting citation: ' + e.message);
    // optional: roll back the UI if you'd like
  }
};
})







async function showAccountSection(fullName, licensePlate, finishedSetup = '') {
  const section    = document.getElementById('accountSection');
  const formFields = document.getElementById('accountFormFields');
  let setupPrompt  = section.querySelector('p');
  if (!setupPrompt) {
    setupPrompt = document.createElement('p');
    section.insertBefore(setupPrompt, formFields);
  }

  const staleBack = document.getElementById('backButton');
  if (staleBack) staleBack.remove();
  document.getElementById('signUpButton').style.display = 'none';
  document.getElementById('loginButton').style.display  = 'none';

  const h1 = section.querySelector('h1');
  h1.innerHTML       = `<p style="font-size:42px;"><b>Welcome, ${toTitleCase(fullName)}</b></p>`;
  h1.style.marginBottom = '5px';

  const user  = firebase.auth().currentUser || {};
  const email = user.email || getCookie('userEmail') || '';

  const newSnap = await db
    .collection('new_users')
    .where('email','==',email)
    .limit(1)
    .get()
    .catch(err => { console.error(err); return { empty: true }; });
  if (!newSnap.empty) {
    const docSnap = newSnap.docs[0];
    const data    = docSnap.data();
    const docId   = docSnap.id;

    if (data.valid === false) {
      setupPrompt.style.display  = '';
      setupPrompt.innerHTML      = `<br>We weren't able to verify your account, please try again`;
      formFields.innerHTML       = `
        <button id="retrySetup" style="margin-top:10px;width:200px;height:50px;font-size:20px;border-radius:20px;">
          Try Again
        </button>
      `;
      document.getElementById('retrySetup').onclick = () => {
        db.collection('new_users').doc(docId).delete();
        setupPrompt.id            = 'setupPrompt';
        setupPrompt.style.display = '';
        setupPrompt.innerHTML     = `<br><br>To finish setting up your account, please enter one of your citations`;
        formFields.innerHTML      = `
          <input
            type="text"
            id="citationNumberSetup"
            placeholder="Citation Number"
            style="margin-bottom:10px;width:90%;height:50px;font-size:18px;border-radius:20px;text-align:center;"
          ><br>
          <button
            id="submitCitationSetup"
            style="margin-top:10px;width:200px;height:50px;font-size:20px;border-radius:20px;"
          >Submit</button>
        `;
        document.getElementById('submitCitationSetup').onclick = submitCitationSetup;
        if (!document.getElementById('logoutButton')) {
          const lo = document.createElement('button');
          lo.id          = 'logoutButton';
          lo.textContent = 'Log Out';
          lo.style.cssText = 'margin-top:40px;width:200px;height:50px;font-size:20px;border-radius:20px;';
          lo.onclick     = logout;
          formFields.appendChild(lo);
        }
      };
      if (!document.getElementById('logoutButton')) {
        const lo = document.createElement('button');
        lo.id          = 'logoutButton';
        lo.textContent = 'Log Out';
        lo.style.cssText = 'margin-top:40px;width:200px;height:50px;font-size:20px;border-radius:20px;';
        lo.onclick     = logout;
        formFields.appendChild(lo);
      }
      return;
    }

    setupPrompt.style.display = '';
    setupPrompt.innerHTML     = '<br><br>Please give us a moment to verify your account…';
    formFields.innerHTML      = '';
    if (!document.getElementById('logoutButton')) {
      const lo = document.createElement('button');
      lo.id          = 'logoutButton';
      lo.textContent = 'Log Out';
      lo.style.cssText = 'margin-top:40px;width:200px;height:50px;font-size:20px;border-radius:20px;';
      lo.onclick     = logout;
      formFields.appendChild(lo);
    }
    return;
  }

  const curSnap = await db
    .collection('current_users')
    .where('email','==',email)
    .limit(1)
    .get()
    .catch(err => { console.error(err); return { empty: true }; });
  if (curSnap.empty) {
    setupPrompt.id            = 'setupPrompt';
    setupPrompt.style.display = '';
    setupPrompt.innerHTML     = '<br><br>To finish setting up your account, please enter one of your citations';
    formFields.innerHTML      = `
      <input
        type="text"
        id="citationNumberSetup"
        placeholder="Citation Number"
        style="margin-bottom:10px;width:90%;height:50px;font-size:18px;border-radius:20px;text-align:center;"
      ><br>
      <button
        id="submitCitationSetup"
        style="margin-top:10px;width:200px;height:50px;font-size:20px;border-radius:20px;"
      >Submit</button>
    `;
    document.getElementById('submitCitationSetup').onclick = submitCitationSetup;
    if (!document.getElementById('logoutButton')) {
      const lo = document.createElement('button');
      lo.id          = 'logoutButton';
      lo.textContent = 'Log Out';
      lo.style.cssText = 'margin-top:40px;width:200px;height:50px;font-size:20px;border-radius:20px;';
      lo.onclick     = logout;
      formFields.appendChild(lo);
    }
    return;
  }

  setupPrompt.style.display = 'none';
  formFields.innerHTML = `
    <div id="parkingSection">
      <p style="font-size:30px;margin:6px 0; font-weight:normal;"><br>
        Park your car and receive live alerts when TAPS is nearby
      </p><br><br>
      <button id="parkButton" class="action-btn">Park</button>
    </div><br>
    <div id="userTicketsHeader" class="tickets-head"></div>
    <div id="userTicketsContainer"></div>
  `;

  (function initParkingBlock() {
    const parkingDiv = document.getElementById('parkingSection');
    const parkBtn    = document.getElementById('parkButton');
    parkBtn.onclick  = startParkingPrompt;

    function startParkingPrompt() {
      parkingDiv.innerHTML = `
	  
        <label><h1>Choose your location</h1></label>
        <select id="parkLocation" style="width:80%;height:50px;margin:6px 0;text-align-last:center;border-radius:20px;font-size:22px;"></select><br><br>
        <label><h1>For how many hours?</h1></label>
        <input type="number" id="parkHours" min="1" max="24" value="2" style="width:120px;height:40px;font-size:22px;text-align:center;border-radius:20px;margin:6px 0;"><br><br>
        <br><button id="confirmPark" class="action-btn">Park</button><br>
        <button id="cancelPark" class="action-btn">Cancel</button>
      `;
      populateParkDropdown();
      document.getElementById('confirmPark').onclick = confirmParking;
      document.getElementById('cancelPark').onclick  = resetParkingUi;
    }

    async function confirmParking() {
      const loc   = document.getElementById('parkLocation').value;
      const hours = parseInt(document.getElementById('parkHours').value, 10);
      if (!hours || hours < 1) return alert('Enter a valid number of hours');
      const name  = getCookie('userFullName') || '';
      if (loc === '__CURRENT_LOCATION__') {
        if (!navigator.geolocation) return alert('Geolocation not supported.');
        return navigator.geolocation.getCurrentPosition(async pos => {
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          const doc = await db.collection('parked_users').add({
            email, fullName: name, location: 'Current Location', coords, hours,
            start: firebase.firestore.FieldValue.serverTimestamp()
          });
          startCountdown(hours * 3600, doc.id);
        }, err => alert('Location error: ' + err.message), { enableHighAccuracy: true, maximumAge: 10000 });
      }
      const doc = await db.collection('parked_users').add({
        email, fullName: name, location: loc, hours,
        start: firebase.firestore.FieldValue.serverTimestamp()
      });
      startCountdown(hours * 3600, doc.id);
    }

    let timerId;
    function startCountdown(seconds, docId) {
      parkingDiv.innerHTML = `
	  
	  <div id="scan" ><br><br>
        <p style="font-size:30px;margin:6px 0;"><b>Scanning for TAPS</b></p><br>
        <div id="countdown" style="font-size:30px;margin:6px 0;"></div>
        <br><p style="font-size:30px;margin:6px 0;"><b>Check your email for live alerts</b></p><br>
        <button id="stopPark" class="action-btn" style="font-size:3vw">Stop</button></div><br><br>
      `;
      updateCountdown(seconds);
      timerId = setInterval(() => {
        seconds-- <= 0 ? stopParking(docId) : updateCountdown(seconds);
      }, 1000);
      document.getElementById('stopPark').onclick = () => stopParking(docId);
    }

    function updateCountdown(sec) {
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60).toString().padStart(2,'0');
      const s = (sec % 60).toString().padStart(2,'0');
      document.getElementById('countdown').textContent = `${h}:${m}:${s}`;
    }

    async function stopParking(docId) {
      clearInterval(timerId);
      await db.collection('parked_users').doc(docId).delete().catch(() => {});
      resetParkingUi();
    }

    (async function resumeParkingIfNeeded() {
      const snap = await db.collection('parked_users')
                           .where('email','==',email)
                           .orderBy('start','desc')
                           .limit(1).get();
      if (snap.empty) return;
      const d = snap.docs[0].data();
      const startedAt = d.start.toDate();
      const remaining = Math.floor((startedAt.getTime() + d.hours*3600000 - Date.now())/1000);
      if (remaining > 0) startCountdown(remaining, snap.docs[0].id);
      else snap.docs[0].ref.delete().catch(() => {});
    })();

    function resetParkingUi() {
      parkingDiv.innerHTML = `
        <p style="font-size:30px;margin:0;">Park your car and receive live alerts when TAPS is nearby</p><br>
        <button id="parkButton" class="action-btn">Park</button>
      `;
      document.getElementById('parkButton').onclick = startParkingPrompt;
    }

    window.__startCountdown = startCountdown;
    window.__stopParking    = stopParking;
  })();

  loadUserTickets(email);

  if (!document.getElementById('logoutButton')) {
    const lo = document.createElement('button');
    lo.id          = 'logoutButton';
    lo.textContent = 'Log Out';
    lo.style.cssText = 'margin-top:40px;width:200px;height:50px;font-size:20px;border-radius:20px;';
    lo.onclick     = logout;
    formFields.appendChild(lo);
  }
}




window.showSignUpForm = showSignUpForm;
window.showLoginForm = showLoginForm;
window.resetAccountSection = resetAccountSection;




window.addEventListener('DOMContentLoaded', function() {
  renderParkSection(false);
});


//alert("Hello! I am an alert box!!");

function renderParkSection(isLoggedIn, userName) {
  console.log('renderParkSection called', { isLoggedIn, userName });
  const parkSection = document.getElementById('parkDynamicSection');
  if (!parkSection) return;
  if (!isLoggedIn) {
    parkSection.innerHTML = `
      <div id="accountSection" class="account-create-section">
        <h1><b><u>Create an Account</u></b></h1><br>
        <p style="font-size:30px;margin-top:-8px;"><br>
          Make an account to get <b>live alerts</b> when TAPS is near your car.
        </p><br><br>
        <div id="accountFormFields"></div>
        <button id="signUpButton" onclick="showSignUpForm()"><h3>Sign&nbsp;Up</h3></button>
        <br>
        <button id="loginButton" onclick="showLoginForm()"><h3>Log&nbsp;In</h3></button><br><br>
      </div>
    `;
  } else {
    // Show the initial Park button
    parkSection.innerHTML = `
      <div id="accountSection"  style="border: 4px solid #6bc1fa; border-radius: 24px; padding: 24px 16px; background: #fff; box-sizing: border-box; width: 90%; margin: 0 auto 24px auto;">
        <h1  style="font-size:5vw"><b>Welcome, <u>${userName}</u></b></h1>
        <br>
        <div id="parkingSection">
          <p style="font-size:30px;margin:6px 0; font-weight:normal;"><br>
            Park your car and receive live alerts when TAPS is nearby
          </p><br><br>
          <button id="parkButton" class="action-btn">Park</button>
        </div>
        <div style="display:flex; flex-direction:column; align-items:center; gap:16px; margin-top:32px;">
          <br><button class="action-btn" onclick="logout()" style="font-size:3vw">Log Out</button><br>
        </div>
      </div>
    `;

    // Attach the full dynamic parking UI logic
    (function initParkingBlock() {
      const parkingDiv = document.getElementById('parkingSection');
      const parkBtn    = document.getElementById('parkButton');
      if (parkBtn) parkBtn.onclick  = startParkingPrompt;

      function startParkingPrompt() {
        parkingDiv.innerHTML = `
          <label><h1>Choose your location</h1></label>
          <select id="parkLocation" style="width:80%;height:50px;margin:6px 0;text-align-last:center;border-radius:20px;font-size:22px;"></select><br><br>
          <label><h1>For how many hours?</h1></label>
          <input type="number" id="parkHours" min="1" max="24" value="2" style="width:120px;height:40px;font-size:22px;text-align:center;border-radius:20px;margin:6px 0;"><br><br>
          <br><button id="confirmPark" class="action-btn">Park</button><br>
          <button id="cancelPark" class="action-btn">Cancel</button>
        `;
        populateParkDropdown();
        document.getElementById('confirmPark').onclick = confirmParking;
        document.getElementById('cancelPark').onclick  = resetParkingUi;
      }

      async function confirmParking() {
        const loc   = document.getElementById('parkLocation').value;
        const hours = parseInt(document.getElementById('parkHours').value, 10);
        if (!hours || hours < 1) return alert('Enter a valid number of hours');
        const name  = getCookie('userFullName') || '';
        const user  = firebase.auth().currentUser || {};
        const email = user.email || getCookie('userEmail') || '';
        if (loc === '__CURRENT_LOCATION__') {
          if (!navigator.geolocation) return alert('Geolocation not supported.');
          return navigator.geolocation.getCurrentPosition(async pos => {
            const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            const doc = await db.collection('parked_users').add({
              email, fullName: name, location: 'Current Location', coords, hours,
              start: firebase.firestore.FieldValue.serverTimestamp()
            });
            startCountdown(hours * 3600, doc.id);
          }, err => alert('Location error: ' + err.message), { enableHighAccuracy: true, maximumAge: 10000 });
        }
        const doc = await db.collection('parked_users').add({
          email, fullName: name, location: loc, hours,
          start: firebase.firestore.FieldValue.serverTimestamp()
        });
        startCountdown(hours * 3600, doc.id);
      }

      let timerId;
      function startCountdown(seconds, docId) {
        parkingDiv.innerHTML = `
           <div id="scan" ><br><br>
        <p style="font-size:30px;margin:6px 0;"><b>Scanning for TAPS</b></p><br>
        <div id="countdown" style="font-size:30px;margin:6px 0;"></div>
        <br><p style="font-size:30px;margin:6px 0;"><b>Check your email for live alerts</b></p><br>
        <button id="stopPark" class="action-btn" style="font-size:3vw">Stop</button></div><br><br>
      `;
        updateCountdown(seconds);
        timerId = setInterval(() => {
          seconds-- <= 0 ? stopParking(docId) : updateCountdown(seconds);
        }, 1000);
        document.getElementById('stopPark').onclick = () => stopParking(docId);
      }

      function updateCountdown(sec) {
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60).toString().padStart(2,'0');
        const s = (sec % 60).toString().padStart(2,'0');
        document.getElementById('countdown').textContent = `${h}:${m}:${s}`;
      }

      async function stopParking(docId) {
        clearInterval(timerId);
        await db.collection('parked_users').doc(docId).delete().catch(() => {});
        resetParkingUi();
      }

      (async function resumeParkingIfNeeded() {
        const user  = firebase.auth().currentUser || {};
        const email = user.email || getCookie('userEmail') || '';
        const snap = await db.collection('parked_users')
                             .where('email','==',email)
                             .orderBy('start','desc')
                             .limit(1).get();
        if (snap.empty) return;
        const d = snap.docs[0].data();
        const startedAt = d.start.toDate();
        const remaining = Math.floor((startedAt.getTime() + d.hours*3600000 - Date.now())/1000);
        if (remaining > 0) startCountdown(remaining, snap.docs[0].id);
        else snap.docs[0].ref.delete().catch(() => {});
      })();

      function resetParkingUi() {
        parkingDiv.innerHTML = `
          <p style="font-size:30px;margin:0;">Park your car and receive live alerts when TAPS is nearby</p><br>
          <button id="parkButton" class="action-btn">Park</button>
        `;
        document.getElementById('parkButton').onclick = startParkingPrompt;
      }

      window.__startCountdown = startCountdown;
      window.__stopParking    = stopParking;
    })();
  }
}



/* ────────────────────────────────────────────────────────────── *
 *  0-A.  refreshParkUi                                           *
 *       – asks Firebase who's signed-in (if anyone)              *
 *       – re-renders the #parkDynamicSection accordingly         *
 * ────────────────────────────────────────────────────────────── */
function refreshParkUi () {
  const user = firebase.auth().currentUser || {};
  const loggedIn = !!user.uid && !user.isAnonymous;
  const name = getCookie('userFullName') || user.displayName || '';
  renderParkSection(loggedIn, name);
}

/* ────────────────────────────────────────────────────────────── *
 *  0-B.  showScreen (NAV TABS) – **replace your old one**        *
 *       – switches screens *and* keeps the Park tab up-to-date   *
 * ────────────────────────────────────────────────────────────── */
function showScreen (screenId, btn) {
  // 1️⃣ toggle visibility
  ['homeScreen','parkScreen','statsScreen'].forEach(id =>
    document.getElementById(id).style.display = (id === screenId ? 'block' : 'none'));

  // 2️⃣ highlight the active button
  document.querySelectorAll('.header-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  // 3️⃣ whenever the user opens Park, rebuild its UI
  if (screenId === 'parkScreen') refreshParkUi();

  // 4️⃣ whenever the user opens Stats, update prediction time to now
  if (screenId === 'statsScreen') {
    setCurrentPredictionTime();
    calculatePrediction();
  }

  // 5️⃣ whenever the user opens Home, reset the UI
  if (screenId === 'homeScreen') resetParkUi();
}

function setCurrentPredictionTime() {
  var now = new Date();
  var formattedTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
  var predTime = document.getElementById('predictionTime');
  if (predTime) {
    predTime.value = formattedTime;
    predTime.readOnly = false;
    predTime.style.pointerEvents = '';
    predTime.style.background = '';
    predTime.style.color = '';
  }
}

// --- Add this utility to ensure prediction always updates ---
function setupPredictionAutoUpdate() {
  // Wait for DOM to have the elements
  setTimeout(function() {
    var locationSel = document.getElementById('predictionLocation');
    var timeInput = document.getElementById('predictionTime');
    if (!locationSel || !timeInput) return;

    // Remove previous listeners if any
    locationSel.removeEventListener('change', calculatePrediction);
    locationSel.addEventListener('change', calculatePrediction);

    // For time input, listen to input and change events
    timeInput.removeEventListener('input', calculatePrediction);
    timeInput.removeEventListener('change', calculatePrediction);
    timeInput.addEventListener('input', calculatePrediction);
    timeInput.addEventListener('change', calculatePrediction);

    // Also, observe value changes (for programmatic changes)
    if (!timeInput._predictionObserver) {
      var lastVal = timeInput.value;
      timeInput._predictionObserver = setInterval(function() {
        if (timeInput.value !== lastVal) {
          lastVal = timeInput.value;
          calculatePrediction();
        }
      }, 500);
    }
  }, 0);
}

// --- Patch showScreen to auto-run prediction on Park tab ---
const _origShowScreen = window.showScreen || showScreen;
window.showScreen = function(screenId, btn) {
  _origShowScreen.apply(this, arguments);
  if (screenId === 'parkScreen' || screenId === 'statsScreen') {
    setupPredictionAutoUpdate();
    calculatePrediction();
  }
};

// Also run on DOMContentLoaded (for first load)
window.addEventListener('DOMContentLoaded', function() {
  setupPredictionAutoUpdate();
  calculatePrediction();
});

