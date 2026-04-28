// Profession-driven copy + sample data used to power booking templates and dashboards.

export type ProfessionId = 'doctor' | 'teacher' | 'sports' | 'salon' | 'therapist' | 'fitness';

export type SampleResource = {
  name: string;
  title: string;
  avatar: string;
};

export type Profession = {
  id: ProfessionId;
  name: string;
  icon: string;
  resourceLabel: string;
  resourcePlural: string;
  slotLabel: string;
  slotDuration: number;
  bookingNoun: string;
  sampleResources: SampleResource[];
  sampleSlots: string[];
  intakeFields: string[];
  metricLabels: [string, string, string, string];
};

export const PROFESSIONS: Record<ProfessionId, Profession> = {
  doctor: {
    id: 'doctor',
    name: 'Doctors & Clinics',
    icon: '✚',
    resourceLabel: 'Doctor',
    resourcePlural: 'Doctors',
    slotLabel: 'Appointment',
    slotDuration: 30,
    bookingNoun: 'patient',
    sampleResources: [
      { name: 'Dr. Anika Patel', title: 'GP · MBBS, MD', avatar: 'AP' },
      { name: 'Dr. Rohit Mehra', title: 'Pediatrics', avatar: 'RM' },
      { name: 'Dr. Lina Sharma', title: 'Dermatology', avatar: 'LS' },
    ],
    sampleSlots: [
      '09:00',
      '09:30',
      '10:00',
      '10:30',
      '11:00',
      '11:30',
      '14:00',
      '14:30',
      '15:00',
      '15:30',
    ],
    intakeFields: ['Reason for visit', 'Existing conditions', 'Insurance ID'],
    metricLabels: ['Appointments', 'No-shows', 'Avg. wait', 'Repeat patients'],
  },
  teacher: {
    id: 'teacher',
    name: 'Teachers & Tutors',
    icon: '✎',
    resourceLabel: 'Tutor',
    resourcePlural: 'Tutors',
    slotLabel: 'Lesson',
    slotDuration: 60,
    bookingNoun: 'student',
    sampleResources: [
      { name: 'Kavya Iyer', title: 'Algebra · Calculus', avatar: 'KI' },
      { name: 'Daniel Kim', title: 'Geometry', avatar: 'DK' },
      { name: 'Priya Rao', title: 'Statistics', avatar: 'PR' },
    ],
    sampleSlots: ['15:00', '16:00', '17:00', '18:00', '19:00', '20:00'],
    intakeFields: ['Grade level', 'Topics to cover', 'Homework attached'],
    metricLabels: ['Lessons', 'Cancellations', 'Avg. duration', 'Recurring students'],
  },
  sports: {
    id: 'sports',
    name: 'Sports Facilities',
    icon: '◉',
    resourceLabel: 'Court',
    resourcePlural: 'Courts',
    slotLabel: 'Booking',
    slotDuration: 60,
    bookingNoun: 'player',
    sampleResources: [
      { name: 'Court 1 · Clay', title: 'Outdoor · Floodlit', avatar: 'C1' },
      { name: 'Court 2 · Hard', title: 'Outdoor', avatar: 'C2' },
      { name: 'Indoor Court A', title: 'Climate controlled', avatar: 'IA' },
    ],
    sampleSlots: ['06:00', '07:00', '08:00', '17:00', '18:00', '19:00', '20:00', '21:00'],
    intakeFields: ['Players', 'Equipment rental', 'Coach add-on'],
    metricLabels: ['Bookings', 'Cancellations', 'Utilisation', 'Repeat players'],
  },
  salon: {
    id: 'salon',
    name: 'Salons & Spas',
    icon: '✦',
    resourceLabel: 'Stylist',
    resourcePlural: 'Stylists',
    slotLabel: 'Appointment',
    slotDuration: 45,
    bookingNoun: 'guest',
    sampleResources: [
      { name: 'Maya Chen', title: 'Color · Cut', avatar: 'MC' },
      { name: 'Arjun Nair', title: 'Cut · Beard', avatar: 'AN' },
    ],
    sampleSlots: ['10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00'],
    intakeFields: ['Service', 'Hair length', 'Notes'],
    metricLabels: ['Appointments', 'No-shows', 'Avg. ticket', 'Repeat guests'],
  },
  therapist: {
    id: 'therapist',
    name: 'Therapists',
    icon: '◐',
    resourceLabel: 'Therapist',
    resourcePlural: 'Therapists',
    slotLabel: 'Session',
    slotDuration: 50,
    bookingNoun: 'client',
    sampleResources: [
      { name: 'Dr. Sara Bose', title: 'CBT · Anxiety', avatar: 'SB' },
      { name: 'Vikram Joshi', title: 'Couples', avatar: 'VJ' },
    ],
    sampleSlots: ['10:00', '11:00', '13:00', '14:00', '15:00', '16:00'],
    intakeFields: ['Reason for session', 'First time?', 'Modality preference'],
    metricLabels: ['Sessions', 'Cancellations', 'Avg. session', 'Continuing clients'],
  },
  fitness: {
    id: 'fitness',
    name: 'Fitness Trainers',
    icon: '▲',
    resourceLabel: 'Trainer',
    resourcePlural: 'Trainers',
    slotLabel: 'Session',
    slotDuration: 60,
    bookingNoun: 'member',
    sampleResources: [
      { name: 'Ravi Singh', title: 'Strength · HIIT', avatar: 'RS' },
      { name: 'Lila Gomes', title: 'Mobility · Yoga', avatar: 'LG' },
    ],
    sampleSlots: ['06:00', '07:00', '08:00', '17:00', '18:00', '19:00', '20:00'],
    intakeFields: ['Goal', 'Injuries', 'Experience level'],
    metricLabels: ['Sessions', 'Cancellations', 'Active members', 'Streak'],
  },
};

export const PROFESSION_LIST: Profession[] = Object.values(PROFESSIONS);
