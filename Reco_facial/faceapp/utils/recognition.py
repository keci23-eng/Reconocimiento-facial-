import json
import numpy as np
import face_recognition


def get_face_encodings_from_fileobj(fileobj):
    # Ensure file pointer is at start; face_recognition.load_image_file accepts file-like objects
    try:
        fileobj.seek(0)
    except Exception:
        pass
    image = face_recognition.load_image_file(fileobj)
    encodings = face_recognition.face_encodings(image)
    return encodings


def encoding_to_json(enc):
    return json.dumps([float(x) for x in enc])


def json_to_encoding(text):
    arr = json.loads(text)
    return np.array(arr, dtype=float)


def find_best_match(known_encodings, unknown_encoding, threshold=0.6):
    if len(known_encodings) == 0:
        return None, None
    dists = np.linalg.norm(np.array(known_encodings) - unknown_encoding, axis=1)
    idx = int(np.argmin(dists))
    return idx, float(dists[idx])
