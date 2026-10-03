
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "availability_reports": {
                  Row: {
                    "created_at": string,"id": string,"menu_item_id": string,"note": string | null,"reported_by": string | null,"resolved_at": string | null,"resolved_by": string | null,"restaurant_id": string,"status": Database["public"]['Enums']["report_status"],"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"menu_item_id": string,"note"?: string | null,"reported_by"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"restaurant_id": string,"status"?: Database["public"]['Enums']["report_status"],"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"menu_item_id"?: string,"note"?: string | null,"reported_by"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"restaurant_id"?: string,"status"?: Database["public"]['Enums']["report_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "availability_reports_menu_item_id_restaurant_id_fkey"
      columns: ["menu_item_id","restaurant_id"]
isOneToOne: false
      referencedRelation: "menu_items"
      referencedColumns: ["id","restaurant_id"]
    }
                  ]
                },"currencies": {
                  Row: {
                    "code": string,"exponent": number,"name": string
                  }
                  Insert: {
                    "code": string,"exponent": number,"name": string
                  }
                  Update: {
                    "code"?: string,"exponent"?: number,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"menu_categories": {
                  Row: {
                    "created_at": string,"description": string | null,"id": string,"is_active": boolean,"name": string,"restaurant_id": string,"sort_order": number,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"is_active"?: boolean,"name": string,"restaurant_id": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"is_active"?: boolean,"name"?: string,"restaurant_id"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "menu_categories_restaurant_id_fkey"
      columns: ["restaurant_id"]
isOneToOne: false
      referencedRelation: "restaurants"
      referencedColumns: ["id"]
    }
                  ]
                },"menu_item_variants": {
                  Row: {
                    "created_at": string,"id": string,"is_available": boolean,"item_id": string,"name": string,"price_minor": number,"restaurant_id": string,"sort_order": number,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_available"?: boolean,"item_id": string,"name": string,"price_minor": number,"restaurant_id": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_available"?: boolean,"item_id"?: string,"name"?: string,"price_minor"?: number,"restaurant_id"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "menu_item_variants_item_id_restaurant_id_fkey"
      columns: ["item_id","restaurant_id"]
isOneToOne: false
      referencedRelation: "menu_items"
      referencedColumns: ["id","restaurant_id"]
    }
                  ]
                },"menu_items": {
                  Row: {
                    "archived_at": string | null,"availability": Database["public"]['Enums']["item_availability"],"category_id": string | null,"created_at": string,"description": string | null,"id": string,"image_url": string | null,"name": string,"price_minor": number,"restaurant_id": string,"sort_order": number,"tags": (string)[],"updated_at": string
                  }
                  Insert: {
                    "archived_at"?: string | null,"availability"?: Database["public"]['Enums']["item_availability"],"category_id"?: string | null,"created_at"?: string,"description"?: string | null,"id"?: string,"image_url"?: string | null,"name": string,"price_minor": number,"restaurant_id": string,"sort_order"?: number,"tags"?: (string)[],"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"availability"?: Database["public"]['Enums']["item_availability"],"category_id"?: string | null,"created_at"?: string,"description"?: string | null,"id"?: string,"image_url"?: string | null,"name"?: string,"price_minor"?: number,"restaurant_id"?: string,"sort_order"?: number,"tags"?: (string)[],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "menu_items_category_id_restaurant_id_fkey"
      columns: ["category_id","restaurant_id"]
isOneToOne: false
      referencedRelation: "menu_categories"
      referencedColumns: ["id","restaurant_id"]
    },{
      foreignKeyName: "menu_items_restaurant_id_fkey"
      columns: ["restaurant_id"]
isOneToOne: false
      referencedRelation: "restaurants"
      referencedColumns: ["id"]
    }
                  ]
                },"menu_modifier_groups": {
                  Row: {
                    "created_at": string,"id": string,"item_id": string,"max_select": number,"min_select": number,"name": string,"restaurant_id": string,"sort_order": number,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"item_id": string,"max_select"?: number,"min_select"?: number,"name": string,"restaurant_id": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"item_id"?: string,"max_select"?: number,"min_select"?: number,"name"?: string,"restaurant_id"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "menu_modifier_groups_item_id_restaurant_id_fkey"
      columns: ["item_id","restaurant_id"]
isOneToOne: false
      referencedRelation: "menu_items"
      referencedColumns: ["id","restaurant_id"]
    }
                  ]
                },"menu_modifiers": {
                  Row: {
                    "created_at": string,"group_id": string,"id": string,"is_available": boolean,"name": string,"price_delta_minor": number,"restaurant_id": string,"sort_order": number,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"group_id": string,"id"?: string,"is_available"?: boolean,"name": string,"price_delta_minor"?: number,"restaurant_id": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"group_id"?: string,"id"?: string,"is_available"?: boolean,"name"?: string,"price_delta_minor"?: number,"restaurant_id"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "menu_modifiers_group_id_restaurant_id_fkey"
      columns: ["group_id","restaurant_id"]
isOneToOne: false
      referencedRelation: "menu_modifier_groups"
      referencedColumns: ["id","restaurant_id"]
    }
                  ]
                },"notification_reads": {
                  Row: {
                    "notification_id": string,"read_at": string,"user_id": string
                  }
                  Insert: {
                    "notification_id": string,"read_at"?: string,"user_id": string
                  }
                  Update: {
                    "notification_id"?: string,"read_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_reads_notification_id_fkey"
      columns: ["notification_id"]
isOneToOne: false
      referencedRelation: "notifications"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "audience": Database["public"]['Enums']["notification_audience"],"body": string | null,"created_at": string,"data": NonNullable<Json>,"id": string,"recipient_roles": (Database["public"]['Enums']["staff_role"])[] | null,"restaurant_id": string,"session_id": string | null,"title": string,"type": string
                  }
                  Insert: {
                    "audience": Database["public"]['Enums']["notification_audience"],"body"?: string | null,"created_at"?: string,"data"?: NonNullable<Json>,"id"?: string,"recipient_roles"?: (Database["public"]['Enums']["staff_role"])[] | null,"restaurant_id": string,"session_id"?: string | null,"title": string,"type": string
                  }
                  Update: {
                    "audience"?: Database["public"]['Enums']["notification_audience"],"body"?: string | null,"created_at"?: string,"data"?: NonNullable<Json>,"id"?: string,"recipient_roles"?: (Database["public"]['Enums']["staff_role"])[] | null,"restaurant_id"?: string,"session_id"?: string | null,"title"?: string,"type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_restaurant_id_fkey"
      columns: ["restaurant_id"]
isOneToOne: false
      referencedRelation: "restaurants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "table_sessions"
      referencedColumns: ["id"]
    }
                  ]
                },"order_items": {
                  Row: {
                    "applied_taxes": NonNullable<Json>,"created_at": string,"id": string,"is_voided": boolean,"line_total_minor": number,"menu_item_id": string | null,"modifiers": NonNullable<Json>,"name": string,"notes": string | null,"order_id": string,"position": number,"quantity": number,"restaurant_id": string,"session_id": string,"unit_price_minor": number,"updated_at": string,"variant_id": string | null,"variant_name": string | null,"void_reason": string | null,"voided_at": string | null,"voided_by": string | null
                  }
                  Insert: {
                    "applied_taxes"?: NonNullable<Json>,"created_at"?: string,"id"?: string,"is_voided"?: boolean,"line_total_minor": number,"menu_item_id"?: string | null,"modifiers"?: NonNullable<Json>,"name": string,"notes"?: string | null,"order_id": string,"position"?: number,"quantity": number,"restaurant_id": string,"session_id": string,"unit_price_minor": number,"updated_at"?: string,"variant_id"?: string | null,"variant_name"?: string | null,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Update: {
                    "applied_taxes"?: NonNullable<Json>,"created_at"?: string,"id"?: string,"is_voided"?: boolean,"line_total_minor"?: number,"menu_item_id"?: string | null,"modifiers"?: NonNullable<Json>,"name"?: string,"notes"?: string | null,"order_id"?: string,"position"?: number,"quantity"?: number,"restaurant_id"?: string,"session_id"?: string,"unit_price_minor"?: number,"updated_at"?: string,"variant_id"?: string | null,"variant_name"?: string | null,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_items_menu_item_id_fkey"
      columns: ["menu_item_id"]
isOneToOne: false
      referencedRelation: "menu_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_order_id_restaurant_id_fkey"
      columns: ["order_id","restaurant_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id","restaurant_id"]
    },{
      foreignKeyName: "order_items_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "menu_item_variants"
      referencedColumns: ["id"]
    }
                  ]
                },"order_status_history": {
                  Row: {
                    "changed_by": string | null,"created_at": string,"from_status": Database["public"]['Enums']["order_status"] | null,"id": string,"order_id": string,"restaurant_id": string,"to_status": Database["public"]['Enums']["order_status"]
                  }
                  Insert: {
                    "changed_by"?: string | null,"created_at"?: string,"from_status"?: Database["public"]['Enums']["order_status"] | null,"id"?: string,"order_id": string,"restaurant_id": string,"to_status": Database["public"]['Enums']["order_status"]
                  }
                  Update: {
                    "changed_by"?: string | null,"created_at"?: string,"from_status"?: Database["public"]['Enums']["order_status"] | null,"id"?: string,"order_id"?: string,"restaurant_id"?: string,"to_status"?: Database["public"]['Enums']["order_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_status_history_order_id_restaurant_id_fkey"
      columns: ["order_id","restaurant_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id","restaurant_id"]
    }
                  ]
                },"order_taxes": {
                  Row: {
                    "amount_minor": number,"created_at": string,"id": string,"is_inclusive": boolean,"name": string,"order_id": string,"rate_bps": number,"restaurant_id": string,"tax_id": string | null
                  }
                  Insert: {
                    "amount_minor": number,"created_at"?: string,"id"?: string,"is_inclusive": boolean,"name": string,"order_id": string,"rate_bps": number,"restaurant_id": string,"tax_id"?: string | null
                  }
                  Update: {
                    "amount_minor"?: number,"created_at"?: string,"id"?: string,"is_inclusive"?: boolean,"name"?: string,"order_id"?: string,"rate_bps"?: number,"restaurant_id"?: string,"tax_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_taxes_order_id_restaurant_id_fkey"
      columns: ["order_id","restaurant_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id","restaurant_id"]
    },{
      foreignKeyName: "order_taxes_tax_id_fkey"
      columns: ["tax_id"]
isOneToOne: false
      referencedRelation: "taxes"
      referencedColumns: ["id"]
    }
                  ]
                },"orders": {
                  Row: {
                    "accepted_at": string | null,"cancel_reason": string | null,"cancelled_at": string | null,"created_at": string,"currency": string,"delivered_at": string | null,"exclusive_tax_minor": number,"guest_id": string | null,"id": string,"inclusive_tax_minor": number,"item_count": number,"notes": string | null,"order_number": number,"placed_at": string,"preparing_at": string | null,"ready_at": string | null,"restaurant_id": string,"session_id": string,"session_seq": number,"status": Database["public"]['Enums']["order_status"],"subtotal_minor": number,"table_id": string,"total_minor": number,"updated_at": string
                  }
                  Insert: {
                    "accepted_at"?: string | null,"cancel_reason"?: string | null,"cancelled_at"?: string | null,"created_at"?: string,"currency": string,"delivered_at"?: string | null,"exclusive_tax_minor"?: number,"guest_id"?: string | null,"id"?: string,"inclusive_tax_minor"?: number,"item_count"?: number,"notes"?: string | null,"order_number": number,"placed_at"?: string,"preparing_at"?: string | null,"ready_at"?: string | null,"restaurant_id": string,"session_id": string,"session_seq": number,"status"?: Database["public"]['Enums']["order_status"],"subtotal_minor"?: number,"table_id": string,"total_minor"?: number,"updated_at"?: string
                  }
                  Update: {
                    "accepted_at"?: string | null,"cancel_reason"?: string | null,"cancelled_at"?: string | null,"created_at"?: string,"currency"?: string,"delivered_at"?: string | null,"exclusive_tax_minor"?: number,"guest_id"?: string | null,"id"?: string,"inclusive_tax_minor"?: number,"item_count"?: number,"notes"?: string | null,"order_number"?: number,"placed_at"?: string,"preparing_at"?: string | null,"ready_at"?: string | null,"restaurant_id"?: string,"session_id"?: string,"session_seq"?: number,"status"?: Database["public"]['Enums']["order_status"],"subtotal_minor"?: number,"table_id"?: string,"total_minor"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "orders_currency_fkey"
      columns: ["currency"]
isOneToOne: false
      referencedRelation: "currencies"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "orders_guest_id_session_id_fkey"
      columns: ["guest_id","session_id"]
isOneToOne: false
      referencedRelation: "session_guests"
      referencedColumns: ["id","session_id"]
    },{
      foreignKeyName: "orders_restaurant_id_fkey"
      columns: ["restaurant_id"]
isOneToOne: false
      referencedRelation: "restaurants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_session_id_restaurant_id_fkey"
      columns: ["session_id","restaurant_id"]
isOneToOne: false
      referencedRelation: "table_sessions"
      referencedColumns: ["id","restaurant_id"]
    },{
      foreignKeyName: "orders_table_id_restaurant_id_fkey"
      columns: ["table_id","restaurant_id"]
isOneToOne: false
      referencedRelation: "restaurant_tables"
      referencedColumns: ["id","restaurant_id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "amount_minor": number,"confirmed_at": string | null,"confirmed_by": string | null,"created_at": string,"currency": string,"failure_reason": string | null,"id": string,"initiated_by": string | null,"method": Database["public"]['Enums']["payment_method"],"note": string | null,"restaurant_id": string,"session_id": string,"status": Database["public"]['Enums']["payment_status"],"stripe_checkout_session_id": string | null,"stripe_payment_intent_id": string | null,"updated_at": string
                  }
                  Insert: {
                    "amount_minor": number,"confirmed_at"?: string | null,"confirmed_by"?: string | null,"created_at"?: string,"currency": string,"failure_reason"?: string | null,"id"?: string,"initiated_by"?: string | null,"method": Database["public"]['Enums']["payment_method"],"note"?: string | null,"restaurant_id": string,"session_id": string,"status"?: Database["public"]['Enums']["payment_status"],"stripe_checkout_session_id"?: string | null,"stripe_payment_intent_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "amount_minor"?: number,"confirmed_at"?: string | null,"confirmed_by"?: string | null,"created_at"?: string,"currency"?: string,"failure_reason"?: string | null,"id"?: string,"initiated_by"?: string | null,"method"?: Database["public"]['Enums']["payment_method"],"note"?: string | null,"restaurant_id"?: string,"session_id"?: string,"status"?: Database["public"]['Enums']["payment_status"],"stripe_checkout_session_id"?: string | null,"stripe_payment_intent_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_currency_fkey"
      columns: ["currency"]
isOneToOne: false
      referencedRelation: "currencies"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "payments_restaurant_id_fkey"
      columns: ["restaurant_id"]
isOneToOne: false
      referencedRelation: "restaurants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_session_id_restaurant_id_fkey"
      columns: ["session_id","restaurant_id"]
isOneToOne: false
      referencedRelation: "table_sessions"
      referencedColumns: ["id","restaurant_id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"email": string | null,"full_name": string | null,"id": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"email"?: string | null,"full_name"?: string | null,"id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string | null,"full_name"?: string | null,"id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"restaurant_review_settings": {
                  Row: {
                    "created_at": string,"display_mode": Database["public"]['Enums']["review_display_mode"],"restaurant_id": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"display_mode"?: Database["public"]['Enums']["review_display_mode"],"restaurant_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"display_mode"?: Database["public"]['Enums']["review_display_mode"],"restaurant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "restaurant_review_settings_restaurant_id_fkey"
      columns: ["restaurant_id"]
isOneToOne: true
      referencedRelation: "restaurants"
      referencedColumns: ["id"]
    }
                  ]
                },"restaurant_tables": {
                  Row: {
                    "archived_at": string | null,"capacity": number,"created_at": string,"id": string,"is_active": boolean,"label": string,"restaurant_id": string,"sort_order": number,"updated_at": string
                  }
                  Insert: {
                    "archived_at"?: string | null,"capacity"?: number,"created_at"?: string,"id"?: string,"is_active"?: boolean,"label": string,"restaurant_id": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"capacity"?: number,"created_at"?: string,"id"?: string,"is_active"?: boolean,"label"?: string,"restaurant_id"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "restaurant_tables_restaurant_id_fkey"
      columns: ["restaurant_id"]
isOneToOne: false
      referencedRelation: "restaurants"
      referencedColumns: ["id"]
    }
                  ]
                },"restaurants": {
                  Row: {
                    "address": string | null,"closed_at": string | null,"created_at": string,"created_by": string | null,"currency": string,"deleted_at": string | null,"description": string | null,"email": string | null,"gallery_urls": (string)[],"hero_image_url": string | null,"id": string,"instagram_handle": string | null,"logo_url": string | null,"menu_mode": Database["public"]['Enums']["menu_mode"],"menu_pdf_url": string | null,"name": string,"next_order_number": number,"opening_hours": NonNullable<Json>,"ordering_enabled": boolean,"phone": string | null,"rating_count": number,"rating_sum": number,"slug": string,"status": Database["public"]['Enums']["restaurant_status"],"tagline": string | null,"timezone": string,"updated_at": string,"website_url": string | null
                  }
                  Insert: {
                    "address"?: string | null,"closed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"deleted_at"?: string | null,"description"?: string | null,"email"?: string | null,"gallery_urls"?: (string)[],"hero_image_url"?: string | null,"id"?: string,"instagram_handle"?: string | null,"logo_url"?: string | null,"menu_mode"?: Database["public"]['Enums']["menu_mode"],"menu_pdf_url"?: string | null,"name": string,"next_order_number"?: number,"opening_hours"?: NonNullable<Json>,"ordering_enabled"?: boolean,"phone"?: string | null,"rating_count"?: number,"rating_sum"?: number,"slug": string,"status"?: Database["public"]['Enums']["restaurant_status"],"tagline"?: string | null,"timezone"?: string,"updated_at"?: string,"website_url"?: string | null
                  }
                  Update: {
                    "address"?: string | null,"closed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"deleted_at"?: string | null,"description"?: string | null,"email"?: string | null,"gallery_urls"?: (string)[],"hero_image_url"?: string | null,"id"?: string,"instagram_handle"?: string | null,"logo_url"?: string | null,"menu_mode"?: Database["public"]['Enums']["menu_mode"],"menu_pdf_url"?: string | null,"name"?: string,"next_order_number"?: number,"opening_hours"?: NonNullable<Json>,"ordering_enabled"?: boolean,"phone"?: string | null,"rating_count"?: number,"rating_sum"?: number,"slug"?: string,"status"?: Database["public"]['Enums']["restaurant_status"],"tagline"?: string | null,"timezone"?: string,"updated_at"?: string,"website_url"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "restaurants_currency_fkey"
      columns: ["currency"]
isOneToOne: false
      referencedRelation: "currencies"
      referencedColumns: ["code"]
    }
                  ]
                },"reviews": {
                  Row: {
                    "body": string | null,"created_at": string,"guest_name": string | null,"id": string,"is_featured": boolean,"is_hidden": boolean,"rating": number,"restaurant_id": string,"session_id": string | null,"updated_at": string,"user_id": string | null
                  }
                  Insert: {
                    "body"?: string | null,"created_at"?: string,"guest_name"?: string | null,"id"?: string,"is_featured"?: boolean,"is_hidden"?: boolean,"rating": number,"restaurant_id": string,"session_id"?: string | null,"updated_at"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "body"?: string | null,"created_at"?: string,"guest_name"?: string | null,"id"?: string,"is_featured"?: boolean,"is_hidden"?: boolean,"rating"?: number,"restaurant_id"?: string,"session_id"?: string | null,"updated_at"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "reviews_restaurant_id_fkey"
      columns: ["restaurant_id"]
isOneToOne: false
      referencedRelation: "restaurants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reviews_session_id_restaurant_id_fkey"
      columns: ["session_id","restaurant_id"]
isOneToOne: false
      referencedRelation: "table_sessions"
      referencedColumns: ["id","restaurant_id"]
    }
                  ]
                },"session_guests": {
                  Row: {
                    "created_at": string,"display_name": string | null,"guest_number": number,"id": string,"joined_at": string,"restaurant_id": string,"session_id": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"display_name"?: string | null,"guest_number": number,"id"?: string,"joined_at"?: string,"restaurant_id": string,"session_id": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string | null,"guest_number"?: number,"id"?: string,"joined_at"?: string,"restaurant_id"?: string,"session_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "session_guests_session_id_restaurant_id_fkey"
      columns: ["session_id","restaurant_id"]
isOneToOne: false
      referencedRelation: "table_sessions"
      referencedColumns: ["id","restaurant_id"]
    }
                  ]
                },"staff_members": {
                  Row: {
                    "created_at": string,"display_name": string,"email": string | null,"id": string,"is_active": boolean,"is_owner": boolean,"restaurant_id": string,"role": Database["public"]['Enums']["staff_role"],"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"display_name": string,"email"?: string | null,"id"?: string,"is_active"?: boolean,"is_owner"?: boolean,"restaurant_id": string,"role": Database["public"]['Enums']["staff_role"],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string,"email"?: string | null,"id"?: string,"is_active"?: boolean,"is_owner"?: boolean,"restaurant_id"?: string,"role"?: Database["public"]['Enums']["staff_role"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "staff_members_restaurant_id_fkey"
      columns: ["restaurant_id"]
isOneToOne: false
      referencedRelation: "restaurants"
      referencedColumns: ["id"]
    }
                  ]
                },"table_requests": {
                  Row: {
                    "acknowledged_at": string | null,"created_at": string,"guest_id": string | null,"id": string,"note": string | null,"preferred_method": Database["public"]['Enums']["payment_method"] | null,"resolved_at": string | null,"resolved_by": string | null,"restaurant_id": string,"session_id": string,"status": Database["public"]['Enums']["request_status"],"table_id": string,"type": Database["public"]['Enums']["request_type"],"updated_at": string
                  }
                  Insert: {
                    "acknowledged_at"?: string | null,"created_at"?: string,"guest_id"?: string | null,"id"?: string,"note"?: string | null,"preferred_method"?: Database["public"]['Enums']["payment_method"] | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"restaurant_id": string,"session_id": string,"status"?: Database["public"]['Enums']["request_status"],"table_id": string,"type": Database["public"]['Enums']["request_type"],"updated_at"?: string
                  }
                  Update: {
                    "acknowledged_at"?: string | null,"created_at"?: string,"guest_id"?: string | null,"id"?: string,"note"?: string | null,"preferred_method"?: Database["public"]['Enums']["payment_method"] | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"restaurant_id"?: string,"session_id"?: string,"status"?: Database["public"]['Enums']["request_status"],"table_id"?: string,"type"?: Database["public"]['Enums']["request_type"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "table_requests_restaurant_id_fkey"
      columns: ["restaurant_id"]
isOneToOne: false
      referencedRelation: "restaurants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "table_requests_session_id_restaurant_id_fkey"
      columns: ["session_id","restaurant_id"]
isOneToOne: false
      referencedRelation: "table_sessions"
      referencedColumns: ["id","restaurant_id"]
    },{
      foreignKeyName: "table_requests_table_id_restaurant_id_fkey"
      columns: ["table_id","restaurant_id"]
isOneToOne: false
      referencedRelation: "restaurant_tables"
      referencedColumns: ["id","restaurant_id"]
    }
                  ]
                },"table_sessions": {
                  Row: {
                    "bill_requested_at": string | null,"closed_at": string | null,"closed_by": string | null,"created_at": string,"guest_count": number,"id": string,"opened_at": string,"order_count": number,"paid_at": string | null,"party_size": number,"restaurant_id": string,"status": Database["public"]['Enums']["session_status"],"table_id": string,"updated_at": string
                  }
                  Insert: {
                    "bill_requested_at"?: string | null,"closed_at"?: string | null,"closed_by"?: string | null,"created_at"?: string,"guest_count"?: number,"id"?: string,"opened_at"?: string,"order_count"?: number,"paid_at"?: string | null,"party_size"?: number,"restaurant_id": string,"status"?: Database["public"]['Enums']["session_status"],"table_id": string,"updated_at"?: string
                  }
                  Update: {
                    "bill_requested_at"?: string | null,"closed_at"?: string | null,"closed_by"?: string | null,"created_at"?: string,"guest_count"?: number,"id"?: string,"opened_at"?: string,"order_count"?: number,"paid_at"?: string | null,"party_size"?: number,"restaurant_id"?: string,"status"?: Database["public"]['Enums']["session_status"],"table_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "table_sessions_restaurant_id_fkey"
      columns: ["restaurant_id"]
isOneToOne: false
      referencedRelation: "restaurants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "table_sessions_table_id_restaurant_id_fkey"
      columns: ["table_id","restaurant_id"]
isOneToOne: false
      referencedRelation: "restaurant_tables"
      referencedColumns: ["id","restaurant_id"]
    }
                  ]
                },"tax_categories": {
                  Row: {
                    "category_id": string,"created_at": string,"restaurant_id": string,"tax_id": string
                  }
                  Insert: {
                    "category_id": string,"created_at"?: string,"restaurant_id": string,"tax_id": string
                  }
                  Update: {
                    "category_id"?: string,"created_at"?: string,"restaurant_id"?: string,"tax_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tax_categories_category_id_restaurant_id_fkey"
      columns: ["category_id","restaurant_id"]
isOneToOne: false
      referencedRelation: "menu_categories"
      referencedColumns: ["id","restaurant_id"]
    },{
      foreignKeyName: "tax_categories_tax_id_restaurant_id_fkey"
      columns: ["tax_id","restaurant_id"]
isOneToOne: false
      referencedRelation: "taxes"
      referencedColumns: ["id","restaurant_id"]
    }
                  ]
                },"tax_items": {
                  Row: {
                    "created_at": string,"item_id": string,"restaurant_id": string,"tax_id": string
                  }
                  Insert: {
                    "created_at"?: string,"item_id": string,"restaurant_id": string,"tax_id": string
                  }
                  Update: {
                    "created_at"?: string,"item_id"?: string,"restaurant_id"?: string,"tax_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tax_items_item_id_restaurant_id_fkey"
      columns: ["item_id","restaurant_id"]
isOneToOne: false
      referencedRelation: "menu_items"
      referencedColumns: ["id","restaurant_id"]
    },{
      foreignKeyName: "tax_items_tax_id_restaurant_id_fkey"
      columns: ["tax_id","restaurant_id"]
isOneToOne: false
      referencedRelation: "taxes"
      referencedColumns: ["id","restaurant_id"]
    }
                  ]
                },"taxes": {
                  Row: {
                    "created_at": string,"id": string,"is_active": boolean,"is_inclusive": boolean,"name": string,"rate_bps": number,"restaurant_id": string,"scope": Database["public"]['Enums']["tax_scope"],"sort_order": number,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"is_inclusive"?: boolean,"name": string,"rate_bps": number,"restaurant_id": string,"scope"?: Database["public"]['Enums']["tax_scope"],"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"is_inclusive"?: boolean,"name"?: string,"rate_bps"?: number,"restaurant_id"?: string,"scope"?: Database["public"]['Enums']["tax_scope"],"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "taxes_restaurant_id_fkey"
      columns: ["restaurant_id"]
isOneToOne: false
      referencedRelation: "restaurants"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "_build_order_lines":
{ Args: { "p_items": Json,"p_restaurant_id": string }; Returns: Json
                           },
"_item_taxes":
{ Args: { "p_category_id": string,"p_item_id": string,"p_restaurant_id": string }; Returns: Json
                           },
"_mark_item_sold_out":
{ Args: { "p_item_id": string,"p_note": string }; Returns: undefined
                           },
"_notify":
{ Args: { "p_audience": Database["public"]['Enums']["notification_audience"],"p_body"?: string,"p_data"?: Json,"p_restaurant_id": string,"p_roles": (Database["public"]['Enums']["staff_role"])[],"p_session_id": string,"p_title": string,"p_type": string }; Returns: undefined
                           },
"_require_staff":
{ Args: { "p_restaurant_id": string,"p_roles"?: (Database["public"]['Enums']["staff_role"])[] }; Returns: undefined
                           },
"_session_amounts":
{ Args: { "p_session_id": string }; Returns: Record<string, unknown>
                           },
"_settle_session":
{ Args: { "p_session_id": string }; Returns: boolean
                           },
"advance_session_orders":
{ Args: { "p_from": Database["public"]['Enums']["order_status"],"p_session_id": string,"p_to": Database["public"]['Enums']["order_status"] }; Returns: number
                           },
"calc_line_taxes":
{ Args: { "p_line_total": number,"p_taxes": Json }; Returns: Json
                           },
"close_session":
{ Args: { "p_force"?: boolean,"p_session_id": string }; Returns: undefined
                           },
"create_restaurant":
{ Args: { "p_currency"?: string,"p_display_name"?: string,"p_name": string,"p_slug": string,"p_timezone"?: string }; Returns: Json
                           },
"delete_restaurant":
{ Args: { "p_confirm_slug": string,"p_restaurant_id": string }; Returns: undefined
                           },
"div_round":
{ Args: { "d": number,"n": number }; Returns: number
                           },
"format_money":
{ Args: { "p_amount": number,"p_currency": string }; Returns: string
                           },
"get_analytics":
{ Args: { "p_days"?: number,"p_restaurant_id": string }; Returns: Json
                           },
"get_dashboard":
{ Args: { "p_restaurant_id": string }; Returns: Json
                           },
"get_table_board":
{ Args: { "p_restaurant_id": string }; Returns: Json
                           },
"get_table_entry":
{ Args: { "p_table_id": string }; Returns: Json
                           },
"is_anon":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_session_guest":
{ Args: { "p_session_id": string }; Returns: boolean
                           },
"is_staff":
{ Args: { "p_restaurant_id": string,"p_roles"?: (Database["public"]['Enums']["staff_role"])[] }; Returns: boolean
                           },
"is_valid_timezone":
{ Args: { "tz": string }; Returns: boolean
                           },
"join_table":
{ Args: { "p_display_name"?: string,"p_party_size"?: number,"p_table_id": string }; Returns: Json
                           },
"moderate_review":
{ Args: { "p_is_featured": boolean,"p_is_hidden": boolean,"p_review_id": string }; Returns: Json
                           },
"my_staff_role":
{ Args: { "p_restaurant_id": string }; Returns: Database["public"]['Enums']["staff_role"]
                           },
"order_transition_allowed":
{ Args: { "p_from": Database["public"]['Enums']["order_status"],"p_to": Database["public"]['Enums']["order_status"] }; Returns: boolean
                           },
"place_order":
{ Args: { "p_items": Json,"p_notes"?: string,"p_session_id": string }; Returns: Json
                           },
"quote_order":
{ Args: { "p_items": Json,"p_session_id": string }; Returns: Json
                           },
"recompute_order_totals":
{ Args: { "p_order_id": string }; Returns: undefined
                           },
"record_manual_payment":
{ Args: { "p_amount_minor"?: number,"p_method": Database["public"]['Enums']["payment_method"],"p_note"?: string,"p_session_id": string }; Returns: Json
                           },
"report_item_unavailable":
{ Args: { "p_item_id": string,"p_note"?: string }; Returns: undefined
                           },
"request_assistance":
{ Args: { "p_note"?: string,"p_preferred_method"?: Database["public"]['Enums']["payment_method"],"p_session_id": string,"p_type": Database["public"]['Enums']["request_type"] }; Returns: Json
                           },
"restaurant_is_public":
{ Args: { "p_restaurant_id": string }; Returns: boolean
                           },
"session_bill":
{ Args: { "p_session_id": string }; Returns: Json
                           },
"set_item_availability":
{ Args: { "p_availability": Database["public"]['Enums']["item_availability"],"p_item_id": string }; Returns: Json
                           },
"set_order_status":
{ Args: { "p_order_id": string,"p_reason"?: string,"p_status": Database["public"]['Enums']["order_status"] }; Returns: Json
                           },
"set_restaurant_status":
{ Args: { "p_restaurant_id": string,"p_status": Database["public"]['Enums']["restaurant_status"] }; Returns: Json
                           },
"storage_restaurant_id":
{ Args: { "p_name": string }; Returns: string
                           },
"stripe_attach_checkout":
{ Args: { "p_checkout_session_id": string,"p_payment_id": string }; Returns: undefined
                           },
"stripe_complete_payment":
{ Args: { "p_amount_minor": number,"p_checkout_session_id": string,"p_currency": string,"p_payment_id": string,"p_payment_intent_id": string }; Returns: Json
                           },
"stripe_fail_payment":
{ Args: { "p_payment_id": string,"p_reason": string,"p_status": Database["public"]['Enums']["payment_status"] }; Returns: undefined
                           },
"stripe_prepare_payment":
{ Args: { "p_session_id": string,"p_user_id": string }; Returns: Json
                           },
"submit_review":
{ Args: { "p_body"?: string,"p_guest_name"?: string,"p_rating": number,"p_session_id": string }; Returns: Json
                           },
"summarize_lines":
{ Args: { "p_lines": Json }; Returns: Json
                           },
"update_request_status":
{ Args: { "p_request_id": string,"p_status": Database["public"]['Enums']["request_status"] }; Returns: Json
                           },
"void_order_item":
{ Args: { "p_mark_sold_out"?: boolean,"p_order_item_id": string,"p_reason"?: string }; Returns: Json
                           }
          }
          Enums: {
            "item_availability": "available"|"sold_out"|"hidden","menu_mode": "html"|"pdf","notification_audience": "staff"|"session","order_status": "pending"|"accepted"|"preparing"|"ready"|"delivered"|"cancelled","payment_method": "stripe"|"cash"|"card"|"other","payment_status": "pending"|"succeeded"|"failed"|"cancelled","report_status": "open"|"resolved","request_status": "open"|"acknowledged"|"resolved","request_type": "bill"|"waiter","restaurant_status": "active"|"closed","review_display_mode": "all_visible"|"featured_only","session_status": "open"|"bill_requested"|"paid"|"closed","staff_role": "manager"|"kitchen"|"waiter","tax_scope": "all"|"categories"|"items"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "item_availability": ["available", "sold_out", "hidden"],"menu_mode": ["html", "pdf"],"notification_audience": ["staff", "session"],"order_status": ["pending", "accepted", "preparing", "ready", "delivered", "cancelled"],"payment_method": ["stripe", "cash", "card", "other"],"payment_status": ["pending", "succeeded", "failed", "cancelled"],"report_status": ["open", "resolved"],"request_status": ["open", "acknowledged", "resolved"],"request_type": ["bill", "waiter"],"restaurant_status": ["active", "closed"],"review_display_mode": ["all_visible", "featured_only"],"session_status": ["open", "bill_requested", "paid", "closed"],"staff_role": ["manager", "kitchen", "waiter"],"tax_scope": ["all", "categories", "items"]
          }
        }
} as const
