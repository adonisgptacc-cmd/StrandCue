import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, StyleSheet, ScrollView, Picker } from 'react-native';
import { useSupabase } from '../ui';
import { z } from 'zod';

const SupportRequestSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
});

type SupportRequestInput = z.infer<typeof SupportRequestSchema>;

export const SupportScreen = () => {
  const { supabase, user } = useSupabase();

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    try {
      const validated = SupportRequestSchema.parse({ subject, body });

      const { error } = await supabase
        .from('support_requests')
        .insert({
          user_id: user?.id,
          subject: validated.subject,
          body: validated.body,
          status: 'open',
        });

      if (error) throw error;

      Alert.alert('Success', 'Support request submitted successfully');
      setSubject('');
      setBody('');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to submit support request');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Support & Help</Text>
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>How can we help?</Text>
        <Text style={styles.infoText}>
          Submit a support request and our team will get back to you. 
          For urgent issues, please check our FAQ first.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>New Support Request</Text>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Subject</Text>
        <TextInput
          style={styles.textInput}
          value={subject}
          onChangeText={setSubject}
          placeholder='Brief summary of your issue'
          maxLength={200}
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.textInput, styles.textArea]}
          value={body}
          onChangeText={setBody}
          placeholder='Describe your issue in detail...'
          multiline={true}
          maxLength={5000}
        />
      </View>

      <View style={styles.actions}>
        <TouchableOpacity 
          style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          <Text style={styles.submitButtonText}>
            {isSubmitting ? 'Submitting...' : 'Submit Request'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Links</Text>
      </View>

      <View style={styles.linksContainer}>
        <TouchableOpacity style={styles.linkItem} onPress={() => Alert.alert('FAQ', 'FAQ page would open here')}>
          <Text style={styles.linkText}>📖 Frequently Asked Questions</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkItem} onPress={() => Alert.alert('Privacy', 'Privacy policy would open here')}>
          <Text style={styles.linkText}>🔒 Privacy Policy</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkItem} onPress={() => Alert.alert('Terms', 'Terms of service would open here')}>
          <Text style={styles.linkText}>📄 Terms of Service</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkItem} onPress={() => Alert.alert('Contact', 'Contact us at support@strandcue.com')}>
          <Text style={styles.linkText}>📧 Contact Support</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#F9FAFB',
  },
  content: {
    paddingBottom: 40,
  },
  section: {
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 20,
  },
  infoCard: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E40AF',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#3B82F6',
    lineHeight: 20,
  },
  formGroup: {
    marginBottom: 15,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 5,
  },
  textInput: {
    height: 50,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 15,
    fontSize: 16,
    backgroundColor: '#FFFFFF',
  },
  textArea: {
    height: 150,
    textAlignVertical: 'top',
    paddingTop: 15,
  },
  actions: {
    marginTop: 20,
  },
  submitButton: {
    backgroundColor: '#4F46E5',
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#A5B4FC',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  linksContainer: {
    marginTop: 10,
  },
  linkItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  linkText: {
    fontSize: 16,
    color: '#374151',
  },
});

export default SupportScreen;