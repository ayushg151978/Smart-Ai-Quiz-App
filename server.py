from flask import Flask, request, jsonify
import sqlite3

app = Flask(__name__)

@app.route("/saveQuiz", methods=["POST"])
def save_quiz():

    data = request.json

    conn = sqlite3.connect("quiz.db")
    c = conn.cursor()

    # 👉 TABLE CREATE
    c.execute("""
    CREATE TABLE IF NOT EXISTS quiz_history (
        topic TEXT,
        score INTEGER,
        total INTEGER
    )
    """)

    # 👉 DATA INSERT
    c.execute(
        "INSERT INTO quiz_history VALUES (?,?,?)",
        (data["topic"], data["score"], data["total"])
    )

    conn.commit()
    conn.close()

    print("Quiz saved to database")

    return jsonify({"message":"saved"})

if __name__ == "__main__":
    app.run(debug=True)