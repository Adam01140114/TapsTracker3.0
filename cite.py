import firebase_admin
from firebase_admin import credentials, firestore

# Initialize Firebase
cred = credentials.Certificate('cred.json')
firebase_admin.initialize_app(cred)

# Firestore client
db = firestore.client()

# Reference to the 'citations' collection
citations_ref = db.collection('citations')

# Fetch all documents in the 'citations' collection
docs = citations_ref.stream()

# Open the citations.txt file in write mode
with open('public\citations.txt', mode='w', newline='') as file:
    # Iterate over each document and write its data to the file
    for doc in docs:
        citation_data = doc.to_dict()
        citationNumber = citation_data.get('citationNumber', 'Unavailable')
        college = citation_data.get('college', 'Unavailable')
        time = citation_data.get('time', 'Unavailable')
        timestamp = citation_data.get('timestamp', 'Unavailable')
        
        # Format the data in the required string format with quotes and a comma
        formatted_data = f'"{citationNumber},{college},{time},{timestamp}",\n'
        
        # Write the formatted string to the file
        file.write(formatted_data)

print("Data compilation complete. All data has been written to citations.txt")
