const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL || "https://uyeevhfdfzqupnwrtjqk.supabase.co",
  process.env.SUPABASE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5ZWV2aGZkZnpxdXBud3J0anFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzgyODQzNjIsImV4cCI6MjA1Mzg2MDM2Mn0.4htFgWEprmsKTO40bgLsNZ1dkZCyShmgDguMu1CXjdE"
);

// GET all enquiries (with filtering and pagination) - FIXED
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      status, 
      search,
      sortBy = 'created_at',
      sortOrder = 'desc' 
    } = req.query;
    
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    // Build query - SELECT SPECIFIC COLUMNS, NOT *
    let query = supabase
      .from('enquiries')
      .select('id, name, phone_number, email_address, enquiry, email_message, how_did_you_hear, added_by, status, created_at, updated_at', { count: 'exact' });
    
    // Apply filters
    if (status) {
      query = query.eq('status', status);
    }
    
    if (search) {
      query = query.or(`name.ilike.%${search}%,email_address.ilike.%${search}%,enquiry.ilike.%${search}%`);
    }
    
    // Apply sorting
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });
    
    // Apply pagination
    query = query.range(offset, offset + parseInt(limit) - 1);
    
    const { data, error, count } = await query;
    
    if (error) {
      console.error('❌ Error fetching enquiries:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch enquiries'
      });
    }

    // Transform data to match frontend interface
    const transformedData = data.map(item => ({
      id: item.id.toString(),
      name: item.name,
      phoneNumber: item.phone_number,
      emailAddress: item.email_address,
      enquiry: item.enquiry,
      emailMessage: item.email_message,
      howDidYouHear: item.how_did_you_hear,
      addedBy: item.added_by,
      status: item.status || 'prospect',
      date: item.created_at,
      updatedAt: item.updated_at
    }));

    res.json({
      success: true,
      data: transformedData,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        totalPages: Math.ceil(count / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('❌ Error in GET /api/enquiries:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// GET single enquiry by ID - FIXED
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data, error } = await supabase
      .from('enquiries')
      .select('id, name, phone_number, email_address, enquiry, email_message, how_did_you_hear, added_by, status, created_at, updated_at')
      .eq('id', id)
      .single();

    if (error) {
      console.error('❌ Error fetching enquiry:', error);
      return res.status(404).json({
        success: false,
        error: 'Enquiry not found'
      });
    }

    // Transform data to match frontend interface
    const transformedData = {
      id: data.id.toString(),
      name: data.name,
      phoneNumber: data.phone_number,
      emailAddress: data.email_address,
      enquiry: data.enquiry,
      emailMessage: data.email_message,
      howDidYouHear: data.how_did_you_hear,
      addedBy: data.added_by,
      status: data.status || 'prospect',
      date: data.created_at,
      updatedAt: data.updated_at
    };

    res.json({
      success: true,
      data: transformedData
    });
  } catch (error) {
    console.error('❌ Error in GET /api/enquiries/:id:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// UPDATE enquiry status - FIXED
router.patch('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!status || !['prospect', 'student', 'dropout', 'graduate'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status. Must be one of: prospect, student, dropout, graduate'
      });
    }

    const { data, error } = await supabase
      .from('enquiries')
      .update({ 
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select('id, name, status, updated_at')
      .single();

    if (error) {
      console.error('❌ Error updating enquiry status:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to update enquiry status'
      });
    }

    res.json({
      success: true,
      message: 'Enquiry status updated successfully',
      data: {
        id: data.id.toString(),
        status: data.status
      }
    });
  } catch (error) {
    console.error('❌ Error in PATCH /api/enquiries/:id/status:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

module.exports = router;