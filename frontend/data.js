// Hard coded examples adapted from prisma/seed.js. Edit these, then reset examples in the browser.
window.EXAMPLE_DATA = {
  "campuses": [
    {
      "name": "North Engineering Campus"
    },
    {
      "name": "South Arts & Sciences Campus"
    }
  ],
  "buildings": [
    {
      "name": "Turing Hall (Computer Eng.)",
      "campus": "North Engineering Campus"
    },
    {
      "name": "Tesla Engineering Lab",
      "campus": "North Engineering Campus"
    },
    {
      "name": "Newton Science Complex",
      "campus": "South Arts & Sciences Campus"
    },
    {
      "name": "Aristotle Humanities Hall",
      "campus": "South Arts & Sciences Campus"
    }
  ],
  "faculties": [
    {
      "name": "Faculty of Engineering"
    },
    {
      "name": "Faculty of Arts & Sciences"
    }
  ],
  "departments": [
    {
      "name": "Computer Engineering",
      "abbreviation": "CS",
      "faculty": "Faculty of Engineering"
    },
    {
      "name": "Electrical & Electronics Engineering",
      "abbreviation": "EE",
      "faculty": "Faculty of Engineering"
    },
    {
      "name": "Mathematics",
      "abbreviation": "MATH",
      "faculty": "Faculty of Arts & Sciences"
    },
    {
      "name": "Physics",
      "abbreviation": "PHYS",
      "faculty": "Faculty of Arts & Sciences"
    }
  ],
  "buildingScores": [
    {
      "department": "CS",
      "building": "Turing Hall (Computer Eng.)",
      "score": 100
    },
    {
      "department": "CS",
      "building": "Tesla Engineering Lab",
      "score": 75
    },
    {
      "department": "EE",
      "building": "Tesla Engineering Lab",
      "score": 100
    },
    {
      "department": "MATH",
      "building": "Newton Science Complex",
      "score": 95
    },
    {
      "department": "PHYS",
      "building": "Newton Science Complex",
      "score": 100
    }
  ],
  "classroomTypes": [
    {
      "name": "Amphitheater"
    },
    {
      "name": "Standard Lecture Room"
    },
    {
      "name": "Computer Laboratory"
    },
    {
      "name": "Science Lab"
    }
  ],
  "courseTypes": [
    {
      "name": "Compulsory"
    },
    {
      "name": "Faculty Elective"
    },
    {
      "name": "Free Elective"
    }
  ],
  "timeStructure": [
    {
      "day": "Monday",
      "start": "08:30",
      "end": "09:20"
    },
    {
      "day": "Monday",
      "start": "09:30",
      "end": "10:20"
    },
    {
      "day": "Monday",
      "start": "10:30",
      "end": "11:20"
    },
    {
      "day": "Monday",
      "start": "11:30",
      "end": "12:20"
    },
    {
      "day": "Monday",
      "start": "13:30",
      "end": "14:20"
    },
    {
      "day": "Monday",
      "start": "14:30",
      "end": "15:20"
    },
    {
      "day": "Monday",
      "start": "15:30",
      "end": "16:20"
    },
    {
      "day": "Monday",
      "start": "16:30",
      "end": "17:20"
    },
    {
      "day": "Tuesday",
      "start": "08:30",
      "end": "09:20"
    },
    {
      "day": "Tuesday",
      "start": "09:30",
      "end": "10:20"
    },
    {
      "day": "Tuesday",
      "start": "10:30",
      "end": "11:20"
    },
    {
      "day": "Tuesday",
      "start": "11:30",
      "end": "12:20"
    },
    {
      "day": "Tuesday",
      "start": "13:30",
      "end": "14:20"
    },
    {
      "day": "Tuesday",
      "start": "14:30",
      "end": "15:20"
    },
    {
      "day": "Tuesday",
      "start": "15:30",
      "end": "16:20"
    },
    {
      "day": "Tuesday",
      "start": "16:30",
      "end": "17:20"
    },
    {
      "day": "Wednesday",
      "start": "08:30",
      "end": "09:20"
    },
    {
      "day": "Wednesday",
      "start": "09:30",
      "end": "10:20"
    },
    {
      "day": "Wednesday",
      "start": "10:30",
      "end": "11:20"
    },
    {
      "day": "Wednesday",
      "start": "11:30",
      "end": "12:20"
    },
    {
      "day": "Wednesday",
      "start": "13:30",
      "end": "14:20"
    },
    {
      "day": "Wednesday",
      "start": "14:30",
      "end": "15:20"
    },
    {
      "day": "Wednesday",
      "start": "15:30",
      "end": "16:20"
    },
    {
      "day": "Wednesday",
      "start": "16:30",
      "end": "17:20"
    },
    {
      "day": "Thursday",
      "start": "08:30",
      "end": "09:20"
    },
    {
      "day": "Thursday",
      "start": "09:30",
      "end": "10:20"
    },
    {
      "day": "Thursday",
      "start": "10:30",
      "end": "11:20"
    },
    {
      "day": "Thursday",
      "start": "11:30",
      "end": "12:20"
    },
    {
      "day": "Thursday",
      "start": "13:30",
      "end": "14:20"
    },
    {
      "day": "Thursday",
      "start": "14:30",
      "end": "15:20"
    },
    {
      "day": "Thursday",
      "start": "15:30",
      "end": "16:20"
    },
    {
      "day": "Thursday",
      "start": "16:30",
      "end": "17:20"
    },
    {
      "day": "Friday",
      "start": "08:30",
      "end": "09:20"
    },
    {
      "day": "Friday",
      "start": "09:30",
      "end": "10:20"
    },
    {
      "day": "Friday",
      "start": "10:30",
      "end": "11:20"
    },
    {
      "day": "Friday",
      "start": "11:30",
      "end": "12:20"
    },
    {
      "day": "Friday",
      "start": "13:30",
      "end": "14:20"
    },
    {
      "day": "Friday",
      "start": "14:30",
      "end": "15:20"
    },
    {
      "day": "Friday",
      "start": "15:30",
      "end": "16:20"
    },
    {
      "day": "Friday",
      "start": "16:30",
      "end": "17:20"
    }
  ],
  "campusTravel": [
    {
      "from": "North Engineering Campus",
      "to": "South Arts & Sciences Campus",
      "minutes": 25
    },
    {
      "from": "South Arts & Sciences Campus",
      "to": "North Engineering Campus",
      "minutes": 25
    }
  ],
  "buildingTravel": [
    {
      "from": "Turing Hall (Computer Eng.)",
      "to": "Tesla Engineering Lab",
      "minutes": 10
    },
    {
      "from": "Newton Science Complex",
      "to": "Aristotle Humanities Hall",
      "minutes": 8
    }
  ],
  "campusBuildingTravel": [
    {
      "from": "North Engineering Campus",
      "to": "Newton Science Complex",
      "minutes": 25
    }
  ],
  "instructors": [
    {
      "name": "Alan",
      "surname": "Turing",
      "email": "a.turing@tech.edu",
      "role": "Instructor",
      "department": "CS",
      "faculty": "Faculty of Engineering",
      "min": 4,
      "max": 8
    },
    {
      "name": "Grace",
      "surname": "Hopper",
      "email": "g.hopper@tech.edu",
      "role": "Instructor",
      "department": "CS",
      "faculty": "Faculty of Engineering",
      "min": 4,
      "max": 8
    },
    {
      "name": "Donald",
      "surname": "Knuth",
      "email": "d.knuth@tech.edu",
      "role": "Instructor",
      "department": "CS",
      "faculty": "Faculty of Engineering",
      "min": 2,
      "max": 6
    },
    {
      "name": "Claude",
      "surname": "Shannon",
      "email": "c.shannon@tech.edu",
      "role": "Instructor",
      "department": "EE",
      "faculty": "Faculty of Engineering",
      "min": 4,
      "max": 8
    },
    {
      "name": "Nikola",
      "surname": "Tesla",
      "email": "n.tesla@tech.edu",
      "role": "Instructor",
      "department": "EE",
      "faculty": "Faculty of Engineering",
      "min": 4,
      "max": 8
    },
    {
      "name": "Ada",
      "surname": "Lovelace",
      "email": "a.lovelace@tech.edu",
      "role": "Instructor",
      "department": "MATH",
      "faculty": "Faculty of Arts & Sciences",
      "min": 4,
      "max": 8
    },
    {
      "name": "Carl",
      "surname": "Gauss",
      "email": "c.gauss@tech.edu",
      "role": "Instructor",
      "department": "MATH",
      "faculty": "Faculty of Arts & Sciences",
      "min": 2,
      "max": 6
    },
    {
      "name": "Richard",
      "surname": "Feynman",
      "email": "r.feynman@tech.edu",
      "role": "Instructor",
      "department": "PHYS",
      "faculty": "Faculty of Arts & Sciences",
      "min": 4,
      "max": 8
    },
    {
      "name": "Marie",
      "surname": "Curie",
      "email": "m.curie@tech.edu",
      "role": "Instructor",
      "department": "PHYS",
      "faculty": "Faculty of Arts & Sciences",
      "min": 4,
      "max": 8
    },
    {
      "name": "Deniz",
      "surname": "Kaya",
      "email": "deniz.kaya@example.com",
      "role": "Teaching Assistant",
      "department": "CS",
      "faculty": "Faculty of Engineering",
      "min": 0,
      "max": 6
    },
    {
      "name": "Ece",
      "surname": "Yilmaz",
      "email": "ece.yilmaz@example.com",
      "role": "Teaching Assistant",
      "department": "EE",
      "faculty": "Faculty of Engineering",
      "min": 0,
      "max": 6
    },
    {
      "name": "Mert",
      "surname": "Demir",
      "email": "mert.demir@example.com",
      "role": "Learning Assistant",
      "department": "CS",
      "faculty": "Faculty of Engineering",
      "min": 0,
      "max": 4
    },
    {
      "name": "Selin",
      "surname": "Aydin",
      "email": "selin.aydin@example.com",
      "role": "Learning Assistant",
      "department": "MATH",
      "faculty": "Faculty of Arts & Sciences",
      "min": 0,
      "max": 4
    }
  ],
  "classrooms": [
    {
      "code": "TH-101",
      "name": "Turing Amphitheater",
      "capacity": 120,
      "bName": "Turing Hall (Computer Eng.)",
      "type": "Amphitheater",
      "building": "Turing Hall (Computer Eng.)",
      "campus": "North Engineering Campus",
      "gap": 10
    },
    {
      "code": "TH-LAB1",
      "name": "Software Development Lab",
      "capacity": 40,
      "bName": "Turing Hall (Computer Eng.)",
      "type": "Computer Laboratory",
      "building": "Turing Hall (Computer Eng.)",
      "campus": "North Engineering Campus",
      "gap": 10
    },
    {
      "code": "TH-201",
      "name": "Algorithm Lecture Room",
      "capacity": 60,
      "bName": "Turing Hall (Computer Eng.)",
      "type": "Standard Lecture Room",
      "building": "Turing Hall (Computer Eng.)",
      "campus": "North Engineering Campus",
      "gap": 10
    },
    {
      "code": "TL-LAB1",
      "name": "Digital Circuit Lab",
      "capacity": 35,
      "bName": "Tesla Engineering Lab",
      "type": "Science Lab",
      "building": "Tesla Engineering Lab",
      "campus": "North Engineering Campus",
      "gap": 10
    },
    {
      "code": "TL-205",
      "name": "Electronics Class",
      "capacity": 55,
      "bName": "Tesla Engineering Lab",
      "type": "Standard Lecture Room",
      "building": "Tesla Engineering Lab",
      "campus": "North Engineering Campus",
      "gap": 10
    },
    {
      "code": "NC-101",
      "name": "Newton Grand Lecture Hall",
      "capacity": 150,
      "bName": "Newton Science Complex",
      "type": "Amphitheater",
      "building": "Newton Science Complex",
      "campus": "South Arts & Sciences Campus",
      "gap": 10
    },
    {
      "code": "NC-LAB1",
      "name": "General Physics Lab",
      "capacity": 30,
      "bName": "Newton Science Complex",
      "type": "Science Lab",
      "building": "Newton Science Complex",
      "campus": "South Arts & Sciences Campus",
      "gap": 10
    },
    {
      "code": "NC-202",
      "name": "Calculus Classroom",
      "capacity": 65,
      "bName": "Newton Science Complex",
      "type": "Standard Lecture Room",
      "building": "Newton Science Complex",
      "campus": "South Arts & Sciences Campus",
      "gap": 10
    },
    {
      "code": "AH-101",
      "name": "Humanities Hall 1",
      "capacity": 70,
      "bName": "Aristotle Humanities Hall",
      "type": "Standard Lecture Room",
      "building": "Aristotle Humanities Hall",
      "campus": "South Arts & Sciences Campus",
      "gap": 10
    }
  ],
  "courses": [
    {
      "code": "CS101",
      "name": "Introduction to Computer Programming",
      "department": "CS",
      "patterns": "3+2, 3+0",
      "sections": [
        {
          "name": "CS101.01",
          "instructor": "Alan Turing",
          "classroom": "TH-101",
          "demand": 60,
          "day": "MONDAY",
          "start": "09:30",
          "end": "11:20",
          "teachingAssistant": "deniz.kaya@example.com",
          "learningAssistant": "mert.demir@example.com"
        },
        {
          "name": "CS101.02",
          "instructor": "Grace Hopper",
          "classroom": "TH-201",
          "demand": 50,
          "day": "TUESDAY",
          "start": "13:30",
          "end": "15:20",
          "teachingAssistant": "",
          "learningAssistant": ""
        }
      ],
      "labs": [
        {
          "name": "CS101.LAB1",
          "instructor": "Grace Hopper",
          "classroom": "TH-LAB1",
          "demand": 30,
          "scheduleType": "Weekly",
          "pattern": "0+2",
          "teachingAssistant": "deniz.kaya@example.com",
          "learningAssistant": ""
        },
        {
          "name": "CS101.LAB2",
          "instructor": "Alan Turing",
          "classroom": "TH-LAB1",
          "demand": 30,
          "scheduleType": "Weekly",
          "pattern": "0+2",
          "teachingAssistant": "deniz.kaya@example.com",
          "learningAssistant": ""
        }
      ],
      "distributions": [
        {
          "term": 1,
          "department": "CS",
          "percentage": 100
        }
      ]
    },
    {
      "code": "CS201",
      "name": "Data Structures & Algorithms",
      "department": "CS",
      "patterns": "3+2",
      "sections": [
        {
          "name": "CS201.01",
          "instructor": "Donald Knuth",
          "classroom": "TH-201",
          "demand": 55,
          "day": "WEDNESDAY",
          "start": "10:30",
          "end": "12:20",
          "teachingAssistant": "",
          "learningAssistant": ""
        }
      ],
      "labs": [
        {
          "name": "CS201.LAB1",
          "instructor": "Donald Knuth",
          "classroom": "TH-LAB1",
          "demand": 28,
          "scheduleType": "Weekly",
          "pattern": "0+2",
          "teachingAssistant": "",
          "learningAssistant": ""
        }
      ],
      "distributions": [
        {
          "term": 1,
          "department": "CS",
          "percentage": 100
        }
      ]
    },
    {
      "code": "MATH101",
      "name": "Calculus I",
      "department": "MATH",
      "patterns": "4+0",
      "sections": [
        {
          "name": "MATH101.01",
          "instructor": "Ada Lovelace",
          "classroom": "NC-101",
          "demand": 110,
          "day": "MONDAY",
          "start": "13:30",
          "end": "15:20",
          "teachingAssistant": "",
          "learningAssistant": "selin.aydin@example.com"
        },
        {
          "name": "MATH101.02",
          "instructor": "Carl Gauss",
          "classroom": "NC-202",
          "demand": 65,
          "day": "THURSDAY",
          "start": "09:30",
          "end": "11:20",
          "teachingAssistant": "",
          "learningAssistant": ""
        }
      ],
      "labs": [],
      "distributions": [
        {
          "term": 1,
          "department": "MATH",
          "percentage": 100
        }
      ]
    },
    {
      "code": "EE101",
      "name": "Basic Circuit Theory",
      "department": "EE",
      "patterns": "3+2",
      "sections": [
        {
          "name": "EE101.01",
          "instructor": "Claude Shannon",
          "classroom": "TL-205",
          "demand": 45,
          "day": "TUESDAY",
          "start": "09:30",
          "end": "11:20",
          "teachingAssistant": "ece.yilmaz@example.com",
          "learningAssistant": ""
        }
      ],
      "labs": [
        {
          "name": "EE101.LAB1",
          "instructor": "Nikola Tesla",
          "classroom": "TL-LAB1",
          "demand": 25,
          "scheduleType": "Weekly",
          "pattern": "0+2",
          "teachingAssistant": "",
          "learningAssistant": ""
        }
      ],
      "distributions": [
        {
          "term": 1,
          "department": "EE",
          "percentage": 100
        }
      ]
    },
    {
      "code": "PHYS101",
      "name": "General Physics I: Mechanics",
      "department": "PHYS",
      "patterns": "3+2",
      "sections": [
        {
          "name": "PHYS101.01",
          "instructor": "Richard Feynman",
          "classroom": "NC-101",
          "demand": 80,
          "day": "FRIDAY",
          "start": "09:30",
          "end": "11:20",
          "teachingAssistant": "",
          "learningAssistant": ""
        }
      ],
      "labs": [
        {
          "name": "PHYS101.LAB1",
          "instructor": "Marie Curie",
          "classroom": "NC-LAB1",
          "demand": 30,
          "scheduleType": "Weekly",
          "pattern": "0+2",
          "teachingAssistant": "",
          "learningAssistant": ""
        }
      ],
      "distributions": [
        {
          "term": 1,
          "department": "PHYS",
          "percentage": 100
        }
      ]
    }
  ],
  "standardRules": [
    {
      "name": "CS101 & MATH101 Same Day",
      "type": "Same Day",
      "elements": "CS101, MATH101"
    },
    {
      "name": "CS101 Lab Sessions Different Time",
      "type": "Different Time",
      "elements": "CS101.LAB1, CS101.LAB2"
    }
  ],
  "orderRules": [
    {
      "name": "CS101 Lecture Before Lab",
      "before": "CS101.01",
      "after": "CS101.LAB1"
    }
  ]
};
